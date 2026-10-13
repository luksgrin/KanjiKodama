package app.kanjikodama.study

import app.kanjikodama.content.ContentDao
import app.kanjikodama.model.Assignment
import app.kanjikodama.model.Block
import app.kanjikodama.model.Curriculum
import app.kanjikodama.model.DAY_MS
import app.kanjikodama.model.ItemKey
import app.kanjikodama.model.PracticeSettings
import app.kanjikodama.model.SrsSettings
import app.kanjikodama.progress.AssignmentEntity
import app.kanjikodama.progress.PracticeEntity
import app.kanjikodama.progress.ProgressDao
import app.kanjikodama.progress.ReviewEntity
import app.kanjikodama.progress.SoftPullEntity
import app.kanjikodama.srs.LessonQueue
import app.kanjikodama.srs.PracticeSampler
import app.kanjikodama.srs.ReviewQueue
import app.kanjikodama.srs.Scheduler
import app.kanjikodama.srs.UnlockEngine
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.random.Random
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** Single entry point for everything the screens need: content + progress + SRS rules. */
@Singleton
class StudyRepository @Inject constructor(
    val content: ContentDao,
    private val progress: ProgressDao,
    private val clock: Clock,
) {
    private var settings = SrsSettings()
    private var practiceSettings = PracticeSettings()
    private val scheduler get() = Scheduler(settings)

    private var cachedCurriculum: Curriculum? = null
    private val curriculumLock = Mutex()

    suspend fun curriculum(): Curriculum = cachedCurriculum ?: curriculumLock.withLock {
        cachedCurriculum ?: content.loadCurriculum().also { cachedCurriculum = it }
    }

    private suspend fun engine() = UnlockEngine(curriculum(), settings)

    fun updateSettings(srs: SrsSettings? = null, practice: PracticeSettings? = null) {
        srs?.let { settings = it }
        practice?.let { practiceSettings = it }
    }

    fun srsSettings(): SrsSettings = settings
    fun practiceSettings(): PracticeSettings = practiceSettings

    // ------------------------------------------------------------------ assignments

    val assignments: Flow<Map<ItemKey, Assignment>> =
        progress.observeAssignments().map { list -> list.associate { e -> e.toDomain().let { it.key to it } } }

    suspend fun assignmentMap(): Map<ItemKey, Assignment> = progress.assignments().associate { e -> e.toDomain().let { it.key to it } }

    /** Create assignments for everything that has become reachable. Safe to call often. */
    suspend fun refreshUnlocks(): Int {
        val now = clock.now()
        val fresh = engine().newUnlocks(assignmentMap(), now)
        if (fresh.isNotEmpty()) progress.upsertAssignments(fresh.map(AssignmentEntity::from))
        return fresh.size
    }

    // ------------------------------------------------------------------ dashboard

    suspend fun dashboard(assignments: Map<ItemKey, Assignment>): DashboardSnapshot {
        val now = clock.now()
        val engine = engine()
        val level = engine.highestOpenLevel(assignments)
        val block = engine.currentBlock(assignments)
        val started = assignments.values.filter { it.isStarted }
        val due = ReviewQueue.due(assignments.values, now)
        val next = assignments.values.filter { it.isStarted && !it.isBurned && (it.availableAt ?: 0) > now }.minOfOrNull { it.availableAt!! }
        val lapses = progress.reviewStatsSince(now - 14 * DAY_MS).filter { it.lapses >= 4 }
        return DashboardSnapshot(
            level = level,
            block = block,
            lessonsAvailable = assignments.values.count { !it.isStarted },
            reviewsAvailable = due.size,
            nextReviewAt = next,
            forecast24h = ReviewQueue.forecast(assignments.values, now, 24),
            levelProgress = engine.levelProgress(assignments, level),
            blockProgress = engine.blockProgress(assignments, block),
            stageCounts = StageCounts(
                apprentice = started.count { it.stage in 1..4 },
                guru = started.count { it.stage in 5..6 },
                master = started.count { it.stage == 7 },
                enlightened = started.count { it.stage == 8 },
                burned = started.count { it.stage == 9 },
            ),
            leechCandidates = lapses.map { ItemKey(app.kanjikodama.model.ItemType.valueOf(it.type), it.key) },
        )
    }

    // ------------------------------------------------------------------ lessons

    suspend fun lessonBatch(): List<Assignment> {
        val now = clock.now()
        val dayStart = now - (now % DAY_MS)
        val doneToday = progress.lessonsStartedSince(dayStart)
        return LessonQueue.nextBatch(curriculum(), assignmentMap().values, settings.lessonBatchSize, settings.dailyLessonCap, doneToday)
    }

    suspend fun lessonsRemaining(): Int = assignmentMap().values.count { !it.isStarted }

    suspend fun completeLessons(keys: List<ItemKey>) {
        val now = clock.now()
        val map = assignmentMap()
        val started = keys.mapNotNull { map[it] }.filter { !it.isStarted }.map { scheduler.startLesson(it, now) }
        if (started.isNotEmpty()) progress.upsertAssignments(started.map(AssignmentEntity::from))
        refreshUnlocks()
    }

    // ------------------------------------------------------------------ reviews

    suspend fun dueReviews(random: Random = Random.Default): List<Assignment> =
        ReviewQueue.session(assignmentMap().values, clock.now(), random)

    suspend fun submitReview(key: ItemKey, meaningIncorrect: Int, readingIncorrect: Int): ReviewOutcome {
        val now = clock.now()
        val engine = engine()
        val before = assignmentMap()
        val a = before[key] ?: error("no assignment for $key")
        val levelBefore = engine.highestOpenLevel(before)
        val blockBefore = engine.currentBlock(before)
        val result = scheduler.review(a, meaningIncorrect, readingIncorrect, now)
        progress.applyReview(AssignmentEntity.from(result.assignment), ReviewEntity.from(result.record))
        val after = before + (key to result.assignment)
        val levelAfter = engine.highestOpenLevel(after)
        val blockAfter = engine.currentBlock(after)
        refreshUnlocks()
        return ReviewOutcome(
            assignment = result.assignment,
            stageBefore = result.record.stageBefore,
            stageAfter = result.record.stageAfter,
            newLevel = levelAfter.takeIf { it > levelBefore },
            clearedBlock = blockBefore.takeIf { blockAfter != blockBefore },
        )
    }

    suspend fun resurrect(key: ItemKey) {
        val a = assignmentMap()[key] ?: return
        if (a.isBurned) progress.upsertAssignments(listOf(AssignmentEntity.from(scheduler.resurrect(a, clock.now()))))
    }

    // ------------------------------------------------------------------ practice

    suspend fun practiceStates(): List<PracticeSampler.ItemState> {
        val now = clock.now()
        val lastReview = progress.lastReviewed().associate { ItemKey(app.kanjikodama.model.ItemType.valueOf(it.type), it.key) to it.lastAt }
        val lastPractice = progress.lastPracticed().associate { ItemKey(app.kanjikodama.model.ItemType.valueOf(it.type), it.key) to it.lastAt }
        val lapses = progress.reviewStatsSince(now - 30 * DAY_MS).associate { ItemKey(app.kanjikodama.model.ItemType.valueOf(it.type), it.key) to it.lapses }
        return assignmentMap().values.filter { it.isStarted }.map { a ->
            val seen = listOfNotNull(lastReview[a.key], lastPractice[a.key]).maxOrNull()
            PracticeSampler.ItemState(a, seen, lapses[a.key] ?: 0)
        }
    }

    suspend fun practiceContext(): Pair<Block, Int> {
        val map = assignmentMap()
        val engine = engine()
        return engine.currentBlock(map) to engine.highestOpenLevel(map)
    }

    suspend fun sampler(): PracticeSampler = PracticeSampler(curriculum(), practiceSettings)

    suspend fun recordPractice(key: ItemKey, block: Block, correct: Boolean, wasRefresher: Boolean): PracticeSampler.SoftEffect? {
        val now = clock.now()
        progress.insertPractice(PracticeEntity(0, key.type.name, key.key, block.name, now, correct, wasRefresher))
        if (!practiceSettings.soft || correct) return null
        val a = assignmentMap()[key] ?: return null
        val last = progress.softPull(key.type.name, key.key)?.lastPullAt
        val effect = sampler().softEffect(a, correct, now, last)
        if (effect.pulledForward) {
            progress.upsertAssignments(listOf(AssignmentEntity.from(effect.assignment)))
            progress.upsertSoftPull(SoftPullEntity(key.type.name, key.key, now))
        }
        return effect
    }

    // ------------------------------------------------------------------ user data

    suspend fun synonyms(key: ItemKey): List<String> = progress.synonyms(key.type.name, key.key)
}

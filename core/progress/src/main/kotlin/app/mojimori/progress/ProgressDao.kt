package app.mojimori.progress

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import androidx.room.Upsert
import kotlinx.coroutines.flow.Flow

@Dao
interface ProgressDao {
    @Query("SELECT * FROM assignment")
    fun observeAssignments(): Flow<List<AssignmentEntity>>

    @Query("SELECT * FROM assignment")
    suspend fun assignments(): List<AssignmentEntity>

    @Query("SELECT * FROM assignment WHERE type = :type AND `key` = :key")
    suspend fun assignment(type: String, key: String): AssignmentEntity?

    @Upsert
    suspend fun upsertAssignments(items: List<AssignmentEntity>)

    @Query("SELECT COUNT(*) FROM assignment WHERE startedAt >= :since")
    suspend fun lessonsStartedSince(since: Long): Int

    @Insert(onConflict = OnConflictStrategy.ABORT)
    suspend fun insertReview(review: ReviewEntity): Long

    @Query("SELECT * FROM review WHERE reviewedAt >= :since ORDER BY reviewedAt")
    suspend fun reviewsSince(since: Long): List<ReviewEntity>

    @Query("SELECT type, `key`, MAX(reviewedAt) AS lastAt, SUM(meaningIncorrect + readingIncorrect) AS lapses FROM review WHERE reviewedAt >= :since GROUP BY type, `key`")
    suspend fun reviewStatsSince(since: Long): List<ReviewStat>

    @Query("SELECT type, `key`, MAX(reviewedAt) AS lastAt FROM review GROUP BY type, `key`")
    suspend fun lastReviewed(): List<LastSeen>

    @Insert
    suspend fun insertPractice(practice: PracticeEntity): Long

    @Query("SELECT type, `key`, MAX(at) AS lastAt FROM practice GROUP BY type, `key`")
    suspend fun lastPracticed(): List<LastSeen>

    @Query("SELECT * FROM practice WHERE at >= :since ORDER BY at")
    suspend fun practiceSince(since: Long): List<PracticeEntity>

    @Query("SELECT * FROM soft_pull WHERE type = :type AND `key` = :key")
    suspend fun softPull(type: String, key: String): SoftPullEntity?

    @Upsert
    suspend fun upsertSoftPull(pull: SoftPullEntity)

    @Query("SELECT text FROM user_synonym WHERE type = :type AND `key` = :key")
    suspend fun synonyms(type: String, key: String): List<String>

    @Upsert
    suspend fun upsertSynonym(synonym: UserSynonymEntity)

    @Query("DELETE FROM user_synonym WHERE type = :type AND `key` = :key AND text = :text")
    suspend fun deleteSynonym(type: String, key: String, text: String)

    @Query("SELECT * FROM user_note WHERE type = :type AND `key` = :key")
    suspend fun note(type: String, key: String): UserNoteEntity?

    @Upsert
    suspend fun upsertNote(note: UserNoteEntity)

    @Transaction
    suspend fun applyReview(assignment: AssignmentEntity, review: ReviewEntity) {
        upsertAssignments(listOf(assignment))
        insertReview(review)
    }

    @Query("DELETE FROM assignment")
    suspend fun clearAssignments()
}

data class ReviewStat(val type: String, val key: String, val lastAt: Long, val lapses: Int)

data class LastSeen(val type: String, val key: String, val lastAt: Long)

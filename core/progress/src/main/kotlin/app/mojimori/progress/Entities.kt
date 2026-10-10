package app.mojimori.progress

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import app.mojimori.model.Assignment
import app.mojimori.model.ItemKey
import app.mojimori.model.ItemType
import app.mojimori.model.PracticeRecord
import app.mojimori.model.ReviewRecord

@Entity(tableName = "assignment", primaryKeys = ["type", "key"], indices = [Index("availableAt"), Index("startedAt")])
data class AssignmentEntity(
    val type: String,
    val key: String,
    val stage: Int,
    val unlockedAt: Long,
    val startedAt: Long?,
    val availableAt: Long?,
    val passedAt: Long?,
    val burnedAt: Long?,
    val resurrectedAt: Long?,
) {
    fun toDomain() = Assignment(ItemKey(ItemType.valueOf(type), key), stage, unlockedAt, startedAt, availableAt, passedAt, burnedAt, resurrectedAt)

    companion object {
        fun from(a: Assignment) = AssignmentEntity(
            a.key.type.name, a.key.key, a.stage, a.unlockedAt, a.startedAt, a.availableAt, a.passedAt, a.burnedAt, a.resurrectedAt,
        )
    }
}

@Entity(tableName = "review", indices = [Index("type", "key"), Index("reviewedAt")])
data class ReviewEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val type: String,
    val key: String,
    val reviewedAt: Long,
    val stageBefore: Int,
    val stageAfter: Int,
    val meaningIncorrect: Int,
    val readingIncorrect: Int,
) {
    fun toDomain() = ReviewRecord(ItemKey(ItemType.valueOf(type), key), reviewedAt, stageBefore, stageAfter, meaningIncorrect, readingIncorrect)

    companion object {
        fun from(r: ReviewRecord) = ReviewEntity(0, r.key.type.name, r.key.key, r.reviewedAt, r.stageBefore, r.stageAfter, r.meaningIncorrect, r.readingIncorrect)
    }
}

@Entity(tableName = "practice", indices = [Index("type", "key"), Index("at")])
data class PracticeEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val type: String,
    val key: String,
    val block: String,
    val at: Long,
    val correct: Boolean,
    val wasRefresher: Boolean,
) {
    fun toDomain() = PracticeRecord(ItemKey(ItemType.valueOf(type), key), at, correct, wasRefresher)
}

@Entity(tableName = "soft_pull", primaryKeys = ["type", "key"])
data class SoftPullEntity(val type: String, val key: String, val lastPullAt: Long)

@Entity(tableName = "user_synonym", primaryKeys = ["type", "key", "text"])
data class UserSynonymEntity(val type: String, val key: String, val text: String)

@Entity(tableName = "user_note", primaryKeys = ["type", "key"])
data class UserNoteEntity(val type: String, val key: String, val text: String)

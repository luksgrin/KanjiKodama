package app.kanjikodama.progress

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [AssignmentEntity::class, ReviewEntity::class, PracticeEntity::class, SoftPullEntity::class, UserSynonymEntity::class, UserNoteEntity::class],
    version = 1,
    exportSchema = true,
)
abstract class ProgressDatabase : RoomDatabase() {
    abstract fun dao(): ProgressDao

    companion object {
        const val NAME = "progress.db"

        fun build(context: Context): ProgressDatabase =
            Room.databaseBuilder(context, ProgressDatabase::class.java, NAME).build()
    }
}

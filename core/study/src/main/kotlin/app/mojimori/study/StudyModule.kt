package app.mojimori.study

import android.content.Context
import app.mojimori.content.ContentDao
import app.mojimori.content.ContentStore
import app.mojimori.progress.ProgressDao
import app.mojimori.progress.ProgressDatabase
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object StudyModule {
    @Provides
    @Singleton
    fun contentDao(@ApplicationContext context: Context): ContentDao = ContentDao(ContentStore(context))

    @Provides
    @Singleton
    fun progressDatabase(@ApplicationContext context: Context): ProgressDatabase = ProgressDatabase.build(context)

    @Provides
    fun progressDao(db: ProgressDatabase): ProgressDao = db.dao()

    @Provides
    @Singleton
    fun clock(): Clock = Clock.SYSTEM
}

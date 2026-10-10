package app.mojimori.content

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import java.io.File

/**
 * Copies the bundled, read-only content database out of the APK (once per content version)
 * and opens it. The pipeline's schema is authoritative; Room is deliberately not used here so
 * the prepackaged file never has to match generated entity metadata.
 */
class ContentStore(private val context: Context, private val assetName: String = "content.db") {

    @Volatile
    private var db: SQLiteDatabase? = null

    fun open(): SQLiteDatabase {
        db?.let { if (it.isOpen) return it }
        synchronized(this) {
            db?.let { if (it.isOpen) return it }
            val file = ensureCopied()
            val opened = SQLiteDatabase.openDatabase(file.path, null, SQLiteDatabase.OPEN_READONLY)
            db = opened
            return opened
        }
    }

    private fun ensureCopied(): File {
        val dir = File(context.filesDir, "content").apply { mkdirs() }
        val target = File(dir, assetName)
        val stamp = File(dir, "$assetName.version")
        val assetVersion = assetVersion()
        if (target.exists() && stamp.exists() && stamp.readText() == assetVersion) return target
        context.assets.open(assetName).use { input ->
            target.outputStream().use { output -> input.copyTo(output) }
        }
        stamp.writeText(assetVersion)
        return target
    }

    /** Asset identity: CRC32 of the bundled file, stable per build and cheap for a few MB. */
    private fun assetVersion(): String {
        val crc = java.util.zip.CRC32()
        val buf = ByteArray(1 shl 16)
        var total = 0L
        context.assets.open(assetName).use { input ->
            while (true) {
                val n = input.read(buf)
                if (n < 0) break
                crc.update(buf, 0, n)
                total += n
            }
        }
        return "$total-${crc.value}"
    }
}

package dev.magneticui.magnet

import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.sin

/** One training example: magnet field (µT, device frame) recorded while the magnet sat at ([x], [y]). */
data class Sample(val delta: Vec3, val x: Float, val y: Float)

/** Estimated magnet position in normalized screen coordinates (0..1, may go slightly outside). */
data class Placement(val x: Float, val y: Float, val confidence: Float)

/**
 * Tiny kernel k-nearest-neighbour regressor from the magnet's field vector to its position on
 * screen. It is trained on the phone itself (a few seconds per target point), which captures
 * where this particular phone's magnetometer sits and how the user holds the magnet.
 *
 * Features are the field direction (unit vector) plus log-magnitude: direction tells *where*
 * the magnet is, magnitude mostly tells *how close*.
 */
class MagnetModel(val samples: List<Sample>) {

    val isTrained: Boolean get() = samples.size >= MIN_SAMPLES

    fun predict(delta: Vec3): Placement? {
        val magnitude = delta.length
        if (!isTrained || magnitude < 1e-3f) return null
        val dir = delta.normalized()
        val logM = ln(magnitude)

        val scored = samples.map { s ->
            val dirDist = dir.distanceSq(s.delta.normalized())
            val magDist = (logM - ln(max(s.delta.length, 1e-3f))).let { it * it }
            s to exp(-dirDist / DIR_WIDTH - magDist / MAG_WIDTH)
        }.sortedByDescending { it.second }.take(K)

        val total = scored.sumOf { it.second.toDouble() }.toFloat()
        if (total < 1e-12f) {
            val nearest = scored.first().first
            return Placement(nearest.x, nearest.y, 0f)
        }
        var x = 0f
        var y = 0f
        for ((s, w) in scored) {
            x += s.x * w
            y += s.y * w
        }
        return Placement(x / total, y / total, scored.first().second)
    }

    /** Compact text form for SharedPreferences: `dx,dy,dz,x,y;dx,dy,dz,x,y;...`. */
    fun serialize(): String = samples.joinToString(";") { s ->
        listOf(s.delta.x, s.delta.y, s.delta.z, s.x, s.y).joinToString(",")
    }

    companion object {
        const val MIN_SAMPLES = 4
        private const val K = 5
        private const val DIR_WIDTH = 2f * 0.3f * 0.3f
        private const val MAG_WIDTH = 2f * 0.9f * 0.9f

        val EMPTY = MagnetModel(emptyList())

        fun deserialize(text: String?): MagnetModel {
            if (text.isNullOrBlank()) return EMPTY
            val samples = text.split(";").mapNotNull { row ->
                val v = row.split(",").mapNotNull { it.toFloatOrNull() }
                if (v.size == 5) Sample(Vec3(v[0], v[1], v[2]), v[3], v[4]) else null
            }
            return MagnetModel(samples)
        }

        /**
         * Untrained guess: the in-plane part of the field points along the line between the
         * magnetometer (near the top of most phones) and the magnet. The sign depends on which
         * pole faces the phone, hence [polarity]. Weak field = magnet is farther away.
         */
        fun heuristic(delta: Vec3, strength: Float, polarity: Float): Placement {
            // Device y points up, screen y points down.
            val angle = atan2(-delta.y * polarity, delta.x * polarity)
            val reach = 0.55f - 0.4f * strength
            return Placement(
                x = 0.5f + cos(angle) * reach,
                y = SENSOR_Y + sin(angle) * reach * 1.6f,
                confidence = 0f,
            )
        }

        /** Rough vertical position of the magnetometer on typical phones. */
        const val SENSOR_Y = 0.2f
    }
}

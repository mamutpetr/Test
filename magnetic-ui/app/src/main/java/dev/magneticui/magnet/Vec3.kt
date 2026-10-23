package dev.magneticui.magnet

import kotlin.math.sqrt

/** Small immutable 3D vector in device coordinates (x → right, y → top of phone, z → out of screen). */
data class Vec3(val x: Float, val y: Float, val z: Float) {
    operator fun plus(o: Vec3) = Vec3(x + o.x, y + o.y, z + o.z)
    operator fun minus(o: Vec3) = Vec3(x - o.x, y - o.y, z - o.z)
    operator fun times(k: Float) = Vec3(x * k, y * k, z * k)

    val length: Float get() = sqrt(x * x + y * y + z * z)

    fun normalized(): Vec3 {
        val l = length
        return if (l < 1e-6f) ZERO else this * (1f / l)
    }

    fun distanceSq(o: Vec3): Float {
        val dx = x - o.x
        val dy = y - o.y
        val dz = z - o.z
        return dx * dx + dy * dy + dz * dz
    }

    /** Linear blend towards [o]; alpha = 1 returns [o]. */
    fun lerp(o: Vec3, alpha: Float) = this + (o - this) * alpha

    companion object {
        val ZERO = Vec3(0f, 0f, 0f)

        fun of(values: FloatArray, offset: Int = 0) =
            Vec3(values[offset], values[offset + 1], values[offset + 2])
    }
}

/**
 * Row-major 3×3 rotation matrix as produced by `SensorManager.getRotationMatrixFromVector`,
 * mapping device coordinates to world coordinates. `null` is treated as identity.
 */
object Rotation {
    fun toWorld(r: FloatArray?, v: Vec3): Vec3 = if (r == null) v else Vec3(
        r[0] * v.x + r[1] * v.y + r[2] * v.z,
        r[3] * v.x + r[4] * v.y + r[5] * v.z,
        r[6] * v.x + r[7] * v.y + r[8] * v.z,
    )

    fun toDevice(r: FloatArray?, v: Vec3): Vec3 = if (r == null) v else Vec3(
        r[0] * v.x + r[3] * v.y + r[6] * v.z,
        r[1] * v.x + r[4] * v.y + r[7] * v.z,
        r[2] * v.x + r[5] * v.y + r[8] * v.z,
    )
}

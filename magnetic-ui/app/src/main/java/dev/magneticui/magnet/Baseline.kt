package dev.magneticui.magnet

/**
 * Remembers what the magnetometer reads when no magnet is around (Earth's field plus the
 * phone's own hard-iron offset), so the magnet shows up as the difference from it.
 *
 * Earth's field is kept in world coordinates and rotated back into the device frame with the
 * gyroscope-based orientation, so turning the phone does not look like a magnet appeared.
 * The hard-iron bias is fixed in the device frame and is frozen at calibration time, because
 * Android's own bias estimate slowly "learns" a nearby magnet and would cancel it out.
 */
class Baseline {
    private var earthWorld: Vec3? = null
    private var bias: Vec3 = Vec3.ZERO

    val isReady: Boolean get() = earthWorld != null

    fun reset(raw: Vec3, bias: Vec3, rotation: FloatArray?) {
        this.bias = bias
        earthWorld = Rotation.toWorld(rotation, raw - bias)
    }

    fun clear() {
        earthWorld = null
    }

    /** Reading we would expect right now without a magnet. */
    fun expected(rotation: FloatArray?): Vec3 {
        val earth = earthWorld ?: return Vec3.ZERO
        return Rotation.toDevice(rotation, earth) + bias
    }

    /** Field caused by everything that is not part of the background, i.e. the magnet. */
    fun delta(raw: Vec3, rotation: FloatArray?): Vec3 = raw - expected(rotation)

    /** Slowly follows sensor drift while the field is quiet. */
    fun adapt(raw: Vec3, rotation: FloatArray?, alpha: Float) {
        val earth = earthWorld ?: return
        earthWorld = earth.lerp(Rotation.toWorld(rotation, raw - bias), alpha)
    }
}

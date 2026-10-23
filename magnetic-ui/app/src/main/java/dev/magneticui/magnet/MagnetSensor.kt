package dev.magneticui.magnet

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.LifecycleResumeEffect
import kotlin.math.ln

/** What the UI needs to know about the magnet right now. */
data class MagnetReading(
    /** Magnet is close enough to be tracked. */
    val present: Boolean,
    /** 0..1, smoothed; fades out after the magnet leaves so the UI can ease back. */
    val strength: Float,
    /** Estimated position, normalized to the screen (0..1). Kept at the last value when absent. */
    val x: Float,
    val y: Float,
    /** Magnet-only field in µT, device frame. */
    val delta: Vec3,
    val microTesla: Float,
    /** Background field is still being measured. */
    val calibrating: Boolean,
) {
    companion object {
        val NONE = MagnetReading(false, 0f, 0.5f, 0.5f, Vec3.ZERO, 0f, calibrating = true)
    }
}

/**
 * Turns magnetometer + gyroscope events into a [MagnetReading]. All state is Compose snapshot
 * state, so composables and draw lambdas that read it update automatically.
 */
class MagnetSensor(context: Context) : SensorEventListener {
    private val sensorManager = context.getSystemService(SensorManager::class.java)
    private val uncalibrated = sensorManager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD_UNCALIBRATED)
    private val magnetometer = uncalibrated ?: sensorManager.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)
    private val gyroRotation = sensorManager.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR)
    private val prefs = context.getSharedPreferences("magnetic_ui", Context.MODE_PRIVATE)

    val isAvailable: Boolean get() = magnetometer != null

    var reading by mutableStateOf(MagnetReading.NONE)
        private set
    var model by mutableStateOf(MagnetModel.deserialize(prefs.getString(KEY_MODEL, null)))
        private set
    /** Which pole faces the phone; only matters for the untrained heuristic. */
    var polarity by mutableFloatStateOf(prefs.getFloat(KEY_POLARITY, 1f))
        private set

    private val baseline = Baseline()
    private var rotation: FloatArray? = null
    private var filtered: Vec3? = null
    private var warmupSum = Vec3.ZERO
    private var warmupCount = 0
    private var present = false
    private var strength = 0f
    private var x = 0.5f
    private var y = 0.5f

    fun start() {
        magnetometer?.let { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
        gyroRotation?.let { sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME) }
    }

    fun stop() {
        sensorManager.unregisterListener(this)
    }

    /** Re-measure the background field. Call with the magnet put away. */
    fun recalibrate() {
        baseline.clear()
        warmupSum = Vec3.ZERO
        warmupCount = 0
        present = false
        reading = MagnetReading.NONE
    }

    fun updateModel(newModel: MagnetModel) {
        model = newModel
        prefs.edit().putString(KEY_MODEL, newModel.serialize()).apply()
    }

    fun flipPolarity() {
        polarity = -polarity
        prefs.edit().putFloat(KEY_POLARITY, polarity).apply()
    }

    override fun onSensorChanged(event: SensorEvent) {
        if (event.sensor.type == Sensor.TYPE_GAME_ROTATION_VECTOR) {
            val r = rotation ?: FloatArray(9)
            SensorManager.getRotationMatrixFromVector(r, event.values)
            rotation = r
        } else {
            onMagneticField(event.values, isUncalibrated = event.sensor.type == Sensor.TYPE_MAGNETIC_FIELD_UNCALIBRATED)
        }
    }

    override fun onAccuracyChanged(sensor: Sensor, accuracy: Int) = Unit

    private fun onMagneticField(values: FloatArray, isUncalibrated: Boolean) {
        // Without the orientation the background can't be rotated correctly, so wait for it.
        if (gyroRotation != null && rotation == null) return

        val raw = Vec3.of(values)
        val field = filtered?.lerp(raw, FIELD_SMOOTHING) ?: raw
        filtered = field

        if (!baseline.isReady) {
            warmupSum += field
            warmupCount++
            if (warmupCount >= WARMUP_SAMPLES) {
                val bias = if (isUncalibrated && values.size >= 6) Vec3.of(values, 3) else Vec3.ZERO
                baseline.reset(warmupSum * (1f / warmupCount), bias, rotation)
            }
            return
        }

        val delta = baseline.delta(field, rotation)
        val microTesla = delta.length
        val wasPresent = present
        present = microTesla > if (present) OFF_THRESHOLD else ON_THRESHOLD
        if (microTesla < QUIET_THRESHOLD) baseline.adapt(field, rotation, DRIFT_ALPHA)

        val target = if (present) strengthOf(microTesla) else 0f
        strength += (target - strength) * if (target > strength) RISE else FALL

        if (present) {
            val placement = model.predict(delta) ?: MagnetModel.heuristic(delta, target, polarity)
            if (wasPresent) {
                x += (placement.x - x) * POSITION_SMOOTHING
                y += (placement.y - y) * POSITION_SMOOTHING
            } else {
                x = placement.x
                y = placement.y
            }
        }

        reading = MagnetReading(present, strength, x, y, delta, microTesla, calibrating = false)
    }

    private fun strengthOf(microTesla: Float): Float =
        ((ln(microTesla) - ln(MIN_UT)) / (ln(MAX_UT) - ln(MIN_UT))).coerceIn(0f, 1f)

    private companion object {
        const val KEY_MODEL = "model"
        const val KEY_POLARITY = "polarity"
        const val WARMUP_SAMPLES = 25
        const val FIELD_SMOOTHING = 0.35f
        const val POSITION_SMOOTHING = 0.3f
        const val ON_THRESHOLD = 30f
        const val OFF_THRESHOLD = 18f
        const val QUIET_THRESHOLD = 8f
        const val DRIFT_ALPHA = 0.005f
        const val RISE = 0.35f
        const val FALL = 0.08f
        const val MIN_UT = 15f
        const val MAX_UT = 800f
    }
}

@Composable
fun rememberMagnetSensor(): MagnetSensor {
    val context = LocalContext.current
    val sensor = remember { MagnetSensor(context.applicationContext) }
    LifecycleResumeEffect(sensor) {
        sensor.start()
        onPauseOrDispose { sensor.stop() }
    }
    return sensor
}

package dev.magneticui.magnet

import org.junit.Assert.assertEquals
import org.junit.Test

class BaselineTest {
    private val identity = floatArrayOf(1f, 0f, 0f, 0f, 1f, 0f, 0f, 0f, 1f)

    // Device rotated 90° about z: device x points along world y.
    private val turned = floatArrayOf(0f, -1f, 0f, 1f, 0f, 0f, 0f, 0f, 1f)

    private fun assertVec(expected: Vec3, actual: Vec3) {
        assertEquals(expected.x, actual.x, 1e-3f)
        assertEquals(expected.y, actual.y, 1e-3f)
        assertEquals(expected.z, actual.z, 1e-3f)
    }

    @Test
    fun noMagnetMeansZeroDelta() {
        val baseline = Baseline()
        val raw = Vec3(20f, 30f, -40f)
        baseline.reset(raw, bias = Vec3(5f, 5f, 5f), rotation = identity)
        assertVec(Vec3.ZERO, baseline.delta(raw, identity))
    }

    @Test
    fun turningThePhoneIsNotAMagnet() {
        val baseline = Baseline()
        val bias = Vec3(10f, -4f, 2f)
        val earthWorld = Vec3(0f, 25f, -40f)
        baseline.reset(earthWorld + bias, bias, identity)

        // What the sensor reads after the turn: Earth's field rotated into the device frame + same bias.
        val rawAfterTurn = Rotation.toDevice(turned, earthWorld) + bias
        assertVec(Vec3.ZERO, baseline.delta(rawAfterTurn, turned))

        val magnet = Vec3(150f, 0f, 0f)
        assertVec(magnet, baseline.delta(rawAfterTurn + magnet, turned))
    }

    @Test
    fun rotationRoundTrips() {
        val v = Vec3(1f, 2f, 3f)
        assertVec(v, Rotation.toDevice(turned, Rotation.toWorld(turned, v)))
    }
}

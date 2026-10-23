package dev.magneticui.magnet

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MagnetModelTest {
    // Field pointing a different way for each side of the phone, as recorded during training.
    private val model = MagnetModel(
        listOf(
            Sample(Vec3(200f, 0f, 40f), 0.9f, 0.5f),
            Sample(Vec3(-200f, 0f, 40f), 0.1f, 0.5f),
            Sample(Vec3(0f, 200f, 40f), 0.5f, 0.1f),
            Sample(Vec3(0f, -200f, 40f), 0.5f, 0.9f),
        ),
    )

    @Test
    fun predictsThePositionWhoseFieldMatches() {
        val right = model.predict(Vec3(180f, 15f, 30f))!!
        assertEquals(0.9f, right.x, 0.05f)
        assertEquals(0.5f, right.y, 0.05f)

        val bottom = model.predict(Vec3(-10f, -250f, 50f))!!
        assertEquals(0.5f, bottom.x, 0.05f)
        assertEquals(0.9f, bottom.y, 0.05f)
    }

    @Test
    fun interpolatesBetweenNeighbours() {
        val p = model.predict(Vec3(150f, 150f, 40f))!!
        assertTrue("x=${p.x}", p.x > 0.6f)
        assertTrue("y=${p.y}", p.y < 0.4f)
    }

    @Test
    fun untrainedModelDoesNotPredict() {
        assertFalse(MagnetModel.EMPTY.isTrained)
        assertNull(MagnetModel.EMPTY.predict(Vec3(100f, 0f, 0f)))
    }

    @Test
    fun serializationRoundTrips() {
        val restored = MagnetModel.deserialize(model.serialize())
        assertEquals(model.samples, restored.samples)
        assertTrue(MagnetModel.deserialize("garbage;1,2").samples.isEmpty())
        assertTrue(MagnetModel.deserialize(null).samples.isEmpty())
    }

    @Test
    fun heuristicPointsAlongInPlaneField() {
        val right = MagnetModel.heuristic(Vec3(300f, 0f, 0f), strength = 0.5f, polarity = 1f)
        assertTrue(right.x > 0.5f)
        val flipped = MagnetModel.heuristic(Vec3(300f, 0f, 0f), strength = 0.5f, polarity = -1f)
        assertTrue(flipped.x < 0.5f)
    }
}

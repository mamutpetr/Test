package dev.magneticui.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import dev.magneticui.magnet.MagnetReading
import dev.magneticui.magnet.MagnetSensor
import kotlin.math.atan2
import kotlin.math.max

/** Maps the sensor's normalized magnet position onto the root layout, in pixels. */
class MagnetField(private val sensor: MagnetSensor) {
    var rootSize by mutableStateOf(IntSize.Zero)

    val reading: MagnetReading get() = sensor.reading

    val magnetPx: Offset
        get() = Offset(reading.x * rootSize.width, reading.y * rootSize.height)

    /** 0..1: how strongly the magnet acts on a point, fading with distance beyond [reachPx]. */
    fun influenceAt(point: Offset, reachPx: Float): Float {
        if (point == Offset.Unspecified) return 0f
        val d = (magnetPx - point).getDistance() / reachPx
        return reading.strength / (1f + d * d)
    }

    /** Unit vector from [point] towards the magnet. */
    fun directionFrom(point: Offset): Offset {
        val v = magnetPx - point
        val d = v.getDistance()
        return if (d < 1f) Offset.Zero else v / d
    }
}

val LocalMagnetField = staticCompositionLocalOf<MagnetField?> { null }

@Composable
fun MagneticRoot(sensor: MagnetSensor, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    val field = remember(sensor) { MagnetField(sensor) }
    Box(modifier.fillMaxSize().onSizeChanged { field.rootSize = it }) {
        CompositionLocalProvider(LocalMagnetField provides field, content = content)
    }
}

/** Element drifts towards the magnet and swells slightly as it gets close. */
fun Modifier.magnetic(pull: Dp = 14.dp, reach: Dp = 200.dp): Modifier = composed {
    val field = LocalMagnetField.current ?: return@composed this
    var center by remember { mutableStateOf(Offset.Unspecified) }
    this
        .onGloballyPositioned { center = it.boundsInRoot().center }
        .graphicsLayer {
            val influence = field.influenceAt(center, reach.toPx())
            val dir = field.directionFrom(center)
            translationX = dir.x * pull.toPx() * influence
            translationY = dir.y * pull.toPx() * influence
            val scale = 1f + 0.05f * influence
            scaleX = scale
            scaleY = scale
        }
}

/** Element rotates to point at the magnet (0° = pointing right). */
fun Modifier.pointAtMagnet(reach: Dp = 200.dp): Modifier = composed {
    val field = LocalMagnetField.current ?: return@composed this
    var center by remember { mutableStateOf(Offset.Unspecified) }
    this
        .onGloballyPositioned { center = it.boundsInRoot().center }
        .graphicsLayer {
            val weight = (field.influenceAt(center, reach.toPx()) * 2.5f).coerceAtMost(1f)
            val dir = field.directionFrom(center)
            val angle = Math.toDegrees(atan2(dir.y, dir.x).toDouble()).toFloat()
            rotationZ = angle * weight
        }
}

/** Outline lights up on the side facing the magnet. */
fun Modifier.magneticGlow(
    shape: Shape,
    color: Color,
    width: Dp = 1.5.dp,
    reach: Dp = 200.dp,
): Modifier = composed {
    val field = LocalMagnetField.current ?: return@composed this
    var bounds by remember { mutableStateOf(androidx.compose.ui.geometry.Rect.Zero) }
    this
        .onGloballyPositioned { bounds = it.boundsInRoot() }
        .drawWithContent {
            drawContent()
            val influence = field.influenceAt(bounds.center, reach.toPx())
            if (influence < 0.01f) return@drawWithContent
            val local = field.magnetPx - bounds.topLeft
            val brush = Brush.radialGradient(
                colors = listOf(
                    color.copy(alpha = (influence * 1.4f).coerceAtMost(1f)),
                    color.copy(alpha = influence * 0.25f),
                    Color.Transparent,
                ),
                center = local,
                radius = max(max(size.width, size.height) * 1.3f, 1f),
            )
            drawOutline(shape.createOutline(size, layoutDirection, this), brush, style = Stroke(width.toPx()))
        }
}

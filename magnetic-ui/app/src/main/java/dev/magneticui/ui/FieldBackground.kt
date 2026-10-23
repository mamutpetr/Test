package dev.magneticui.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.unit.dp

/** Grid of "iron filings" that line up with the magnet, plus a soft halo where it is. */
@Composable
fun FieldBackground(color: Color, modifier: Modifier = Modifier) {
    val field = LocalMagnetField.current ?: return
    Canvas(modifier.fillMaxSize()) {
        val reading = field.reading
        val magnet = field.magnetPx
        val step = 26.dp.toPx()
        val reach = 160.dp.toPx()
        val minLen = 1.5.dp.toPx()
        val maxLen = 13.dp.toPx()
        val stroke = 1.6.dp.toPx()

        if (reading.strength > 0.01f) {
            drawCircle(
                brush = Brush.radialGradient(
                    listOf(color.copy(alpha = 0.35f * reading.strength), Color.Transparent),
                    center = magnet,
                    radius = 220.dp.toPx(),
                ),
                radius = 220.dp.toPx(),
                center = magnet,
            )
        }

        var y = step / 2
        while (y < size.height) {
            var x = step / 2
            while (x < size.width) {
                val p = Offset(x, y)
                val influence = field.influenceAt(p, reach)
                val dir = field.directionFrom(p)
                val half = (minLen + (maxLen - minLen) * influence) / 2
                drawLine(
                    color = color.copy(alpha = 0.12f + 0.7f * influence),
                    start = p - dir * half,
                    end = p + dir * half,
                    strokeWidth = stroke,
                    cap = StrokeCap.Round,
                )
                x += step
            }
            y += step
        }
    }
}

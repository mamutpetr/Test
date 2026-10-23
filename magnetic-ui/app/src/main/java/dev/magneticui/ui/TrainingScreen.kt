package dev.magneticui.ui

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameMillis
import androidx.compose.ui.Alignment
import androidx.compose.ui.BiasAlignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.magneticui.magnet.MagnetModel
import dev.magneticui.magnet.MagnetSensor
import dev.magneticui.magnet.Sample
import dev.magneticui.magnet.Vec3

private enum class Phase { Intro, Calibrating, RemoveMagnet, BringMagnet, Holding, Done }

/** Normalized screen points the user shows the magnet at: the edges, corners and centre. */
private val Targets = listOf(
    Offset(0.5f, 0.12f), Offset(0.88f, 0.12f), Offset(0.88f, 0.5f), Offset(0.88f, 0.88f),
    Offset(0.5f, 0.88f), Offset(0.12f, 0.88f), Offset(0.12f, 0.5f), Offset(0.12f, 0.12f),
    Offset(0.5f, 0.5f),
)

private const val SAMPLES_PER_TARGET = 12
private const val SAMPLE_EVERY_MS = 80L
private const val SETTLE_MS = 300L
private const val HOLD_UT = 35f
private const val REMOVED_UT = 15f

@Composable
fun TrainingScreen(sensor: MagnetSensor, onClose: () -> Unit) {
    val haptics = LocalHapticFeedback.current
    var phase by remember { mutableStateOf(Phase.Intro) }
    var targetIndex by remember { mutableIntStateOf(0) }
    var progress by remember { mutableFloatStateOf(0f) }

    LaunchedEffect(phase == Phase.Intro) {
        if (phase == Phase.Intro) return@LaunchedEffect

        phase = Phase.Calibrating
        sensor.recalibrate()
        while (sensor.reading.calibrating) withFrameMillis { }

        val samples = mutableListOf<Sample>()
        for ((index, target) in Targets.withIndex()) {
            targetIndex = index
            progress = 0f
            phase = Phase.RemoveMagnet
            while (sensor.reading.microTesla > REMOVED_UT) withFrameMillis { }

            phase = Phase.BringMagnet
            val collected = mutableListOf<Vec3>()
            var heldSince = -1L
            var lastSample = 0L
            while (collected.size < SAMPLES_PER_TARGET) {
                withFrameMillis { now ->
                    val reading = sensor.reading
                    if (reading.microTesla < HOLD_UT) {
                        // Magnet moved away: start this point over so we only learn a steady hold.
                        heldSince = -1L
                        collected.clear()
                        phase = Phase.BringMagnet
                    } else {
                        if (heldSince < 0) heldSince = now
                        phase = Phase.Holding
                        if (now - heldSince >= SETTLE_MS && now - lastSample >= SAMPLE_EVERY_MS) {
                            collected += reading.delta
                            lastSample = now
                        }
                    }
                    progress = collected.size / SAMPLES_PER_TARGET.toFloat()
                }
            }
            samples += collected.map { Sample(it, target.x, target.y) }
            haptics.performHapticFeedback(HapticFeedbackType.LongPress)
        }

        sensor.updateModel(MagnetModel(samples))
        phase = Phase.Done
    }

    Box(
        Modifier
            .fillMaxSize()
            .background(Color(0xF00B0B0F)),
    ) {
        if (phase in setOf(Phase.RemoveMagnet, Phase.BringMagnet, Phase.Holding)) {
            TargetMarker(Targets[targetIndex], progress, holding = phase == Phase.Holding)
        }

        Column(
            Modifier
                // Between the top row of targets and the middle one, so the text never covers a target.
                .align(BiasAlignment(0f, -0.4f))
                .safeDrawingPadding()
                .padding(horizontal = 48.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            val (title, body) = when (phase) {
                Phase.Intro -> "Навчання" to
                    "Покладіть телефон на стіл і приберіть магніт подалі. Потім підносьте магніт " +
                    "до кожної позначки (над екраном або збоку біля краю) і тримайте, поки коло " +
                    "не заповниться. Тримайте магніт однією стороною до телефона."
                Phase.Calibrating -> "Вимірюю фон…" to "Не рухайте телефон."
                Phase.RemoveMagnet -> "Точка ${targetIndex + 1} з ${Targets.size}" to "Приберіть магніт подалі."
                Phase.BringMagnet -> "Точка ${targetIndex + 1} з ${Targets.size}" to "Піднесіть магніт до позначки."
                Phase.Holding -> "Точка ${targetIndex + 1} з ${Targets.size}" to "Тримайте…"
                Phase.Done -> "Готово!" to "Модель навчена. Тепер інтерфейс знає, де ваш магніт."
            }
            Text(title, color = Color.White, fontSize = 22.sp, textAlign = TextAlign.Center)
            Spacer(Modifier.height(8.dp))
            Text(body, color = Color(0xFFB0B0C0), fontSize = 15.sp, textAlign = TextAlign.Center)
            Spacer(Modifier.height(20.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                when (phase) {
                    Phase.Intro -> {
                        ControlButton("Почати", highlighted = true) { phase = Phase.Calibrating }
                        ControlButton("Скасувати", onClick = onClose)
                    }
                    Phase.Done -> ControlButton("Спробувати", highlighted = true, onClick = onClose)
                    else -> ControlButton("Скасувати", onClick = onClose)
                }
            }
        }
    }
}

@Composable
private fun TargetMarker(target: Offset, progress: Float, holding: Boolean) {
    val pulse by rememberInfiniteTransition(label = "pulse").animateFloat(
        initialValue = 0.85f,
        targetValue = 1.15f,
        animationSpec = infiniteRepeatable(tween(700), RepeatMode.Reverse),
        label = "pulse",
    )
    val accent = Color(0xFF7C8CFF)
    Canvas(Modifier.fillMaxSize()) {
        val c = Offset(target.x * size.width, target.y * size.height)
        val r = 34.dp.toPx()
        drawCircle(accent.copy(alpha = 0.18f), radius = r * (if (holding) 1f else pulse), center = c)
        drawCircle(accent.copy(alpha = 0.5f), radius = r, center = c, style = Stroke(2.dp.toPx()))
        drawArc(
            color = accent,
            startAngle = -90f,
            sweepAngle = 360f * progress,
            useCenter = false,
            topLeft = c - Offset(r, r),
            size = androidx.compose.ui.geometry.Size(r * 2, r * 2),
            style = Stroke(5.dp.toPx()),
        )
        drawCircle(Color.White, radius = 4.dp.toPx(), center = c)
    }
}

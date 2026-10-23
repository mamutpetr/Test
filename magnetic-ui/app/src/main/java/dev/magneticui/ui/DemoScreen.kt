package dev.magneticui.ui

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.magneticui.magnet.MagnetSensor
import kotlinx.coroutines.flow.distinctUntilChanged

private val Accent = Color(0xFF7C8CFF)
private val Surface = Color(0xFF17171E)
private val Outline = Color(0xFF2A2A35)
private val Muted = Color(0xFF8A8A99)

@Composable
fun DemoScreen(sensor: MagnetSensor, onTrain: () -> Unit) {
    var debug by rememberSaveable { mutableStateOf(false) }

    MagneticRoot(sensor, Modifier.background(Color(0xFF0B0B0F))) {
        FieldBackground(Accent)

        Column(
            Modifier
                .fillMaxSize()
                .safeDrawingPadding()
                .padding(horizontal = 20.dp, vertical = 12.dp),
        ) {
            TopBar(sensor)
            Spacer(Modifier.weight(1f))

            Text(
                "Підпишіться\nна розсилку",
                color = Color.White,
                fontSize = 34.sp,
                lineHeight = 38.sp,
                fontWeight = FontWeight.SemiBold,
                modifier = Modifier.magnetic(pull = 8.dp, reach = 260.dp),
            )
            Spacer(Modifier.height(8.dp))
            Text(
                "Піднесіть магніт до телефона — інтерфейс потягнеться до нього.",
                color = Muted,
                fontSize = 15.sp,
            )
            Spacer(Modifier.height(24.dp))
            EmailRow()
            Spacer(Modifier.height(20.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf("Новини", "Дизайн", "Магніти").forEach { Chip(it) }
            }

            Spacer(Modifier.weight(1f))
            Controls(
                sensor = sensor,
                debug = debug,
                onToggleDebug = { debug = !debug },
                onTrain = onTrain,
            )
        }

        if (debug) DebugOverlay(sensor)
    }
}

@Composable
private fun TopBar(sensor: MagnetSensor) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text("Magnetic UI", color = Color.White, fontSize = 18.sp, fontWeight = FontWeight.Medium)
        Spacer(Modifier.weight(1f))
        val reading = sensor.reading
        val text = when {
            !sensor.isAvailable -> "Немає магнітометра"
            reading.calibrating -> "Калібрування…"
            reading.present -> "Магніт · ${reading.microTesla.toInt()} µT"
            else -> "Магніту немає"
        }
        Text(
            text,
            color = if (reading.present) Accent else Muted,
            fontSize = 13.sp,
            modifier = Modifier
                .border(1.dp, Outline, CircleShape)
                .padding(horizontal = 12.dp, vertical = 6.dp),
        )
    }
}

@Composable
private fun EmailRow() {
    var email by rememberSaveable { mutableStateOf("") }
    var sent by rememberSaveable { mutableStateOf(false) }
    val pill = RoundedCornerShape(50)

    Row(verticalAlignment = Alignment.CenterVertically) {
        BasicTextField(
            value = email,
            onValueChange = {
                email = it
                sent = false
            },
            singleLine = true,
            textStyle = TextStyle(color = Color.White, fontSize = 16.sp),
            cursorBrush = SolidColor(Accent),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            modifier = Modifier
                .weight(1f)
                .magnetic()
                .background(Surface, pill)
                .border(1.dp, Outline, pill)
                .magneticGlow(pill, Accent, width = 2.dp)
                .padding(horizontal = 20.dp, vertical = 16.dp),
            decorationBox = { inner ->
                Box {
                    if (email.isEmpty()) {
                        Text(if (sent) "Дякуємо! ✓" else "Ваш email", color = Muted, fontSize = 16.sp)
                    }
                    inner()
                }
            },
        )
        Spacer(Modifier.size(12.dp))
        ArrowButton(onClick = {
            if (email.isNotBlank()) {
                email = ""
                sent = true
            }
        })
    }
}

@Composable
private fun ArrowButton(onClick: () -> Unit) {
    val field = LocalMagnetField.current
    val haptics = LocalHapticFeedback.current
    val reach = with(LocalDensity.current) { 200.dp.toPx() }
    var center by remember { mutableStateOf(Offset.Unspecified) }

    // A little "click" when the magnet gets right next to the button.
    LaunchedEffect(field) {
        if (field == null) return@LaunchedEffect
        snapshotFlow { field.influenceAt(center, reach) > 0.55f }
            .distinctUntilChanged()
            .collect { close -> if (close) haptics.performHapticFeedback(HapticFeedbackType.LongPress) }
    }

    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .onGloballyPositioned { center = it.boundsInRoot().center }
            .magnetic(pull = 22.dp)
            .size(56.dp)
            .background(Surface, CircleShape)
            .border(1.5.dp, Color(0xFFDADAE6), CircleShape)
            .magneticGlow(CircleShape, Accent, width = 3.dp)
            .clickable(onClick = onClick),
    ) {
        Icon(
            Icons.AutoMirrored.Filled.ArrowForward,
            contentDescription = "Надіслати",
            tint = Color.White,
            modifier = Modifier.pointAtMagnet(),
        )
    }
}

@Composable
private fun Chip(label: String) {
    val shape = RoundedCornerShape(12.dp)
    Text(
        label,
        color = Color.White,
        fontSize = 14.sp,
        modifier = Modifier
            .magnetic(pull = 10.dp, reach = 150.dp)
            .background(Surface, shape)
            .border(1.dp, Outline, shape)
            .magneticGlow(shape, Accent, reach = 150.dp)
            .padding(horizontal = 14.dp, vertical = 8.dp),
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun Controls(sensor: MagnetSensor, debug: Boolean, onToggleDebug: () -> Unit, onTrain: () -> Unit) {
    val trained = sensor.model.isTrained
    Text(
        if (trained) "Модель навчена (${sensor.model.samples.size} зразків)"
        else "Модель не навчена — працює приблизний режим. Натисніть «Навчити».",
        color = Muted,
        fontSize = 12.sp,
    )
    Spacer(Modifier.height(8.dp))
    FlowRow(
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        ControlButton("Навчити", highlighted = !trained, onClick = onTrain)
        ControlButton("Фон", onClick = sensor::recalibrate)
        if (!trained) ControlButton("Полярність", onClick = sensor::flipPolarity)
        ControlButton(if (debug) "Debug ✓" else "Debug", onClick = onToggleDebug)
    }
}

@Composable
fun ControlButton(label: String, highlighted: Boolean = false, onClick: () -> Unit) {
    Text(
        label,
        color = if (highlighted) Color.Black else Color.White,
        fontSize = 14.sp,
        fontWeight = FontWeight.Medium,
        modifier = Modifier
            .background(if (highlighted) Accent else Surface, CircleShape)
            .border(1.dp, if (highlighted) Accent else Outline, CircleShape)
            .clickable(onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 10.dp),
    )
}

@Composable
private fun DebugOverlay(sensor: MagnetSensor) {
    val field = LocalMagnetField.current ?: return
    Canvas(Modifier.fillMaxSize()) {
        if (!field.reading.present) return@Canvas
        val m = field.magnetPx
        val arm = 18.dp.toPx()
        drawLine(Color.Red, m - Offset(arm, 0f), m + Offset(arm, 0f), strokeWidth = 2.dp.toPx())
        drawLine(Color.Red, m - Offset(0f, arm), m + Offset(0f, arm), strokeWidth = 2.dp.toPx())
    }
    val r = sensor.reading
    Text(
        "Δ = (%.0f, %.0f, %.0f) µT\n|Δ| = %.0f µT  сила = %.2f\nпозиція = (%.2f, %.2f)".format(
            r.delta.x, r.delta.y, r.delta.z, r.microTesla, r.strength, r.x, r.y,
        ),
        color = Color(0xFFFF8080),
        fontSize = 12.sp,
        style = MaterialTheme.typography.bodySmall,
        modifier = Modifier
            .safeDrawingPadding()
            .padding(top = 56.dp, start = 20.dp),
    )
}

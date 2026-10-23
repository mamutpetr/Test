package dev.magneticui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import dev.magneticui.magnet.rememberMagnetSensor
import dev.magneticui.ui.DemoScreen
import dev.magneticui.ui.TrainingScreen

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            MaterialTheme(colorScheme = darkColorScheme(primary = Color(0xFF7C8CFF))) {
                val sensor = rememberMagnetSensor()
                var training by rememberSaveable { mutableStateOf(false) }

                DemoScreen(sensor, onTrain = { training = true })
                if (training) {
                    BackHandler { training = false }
                    TrainingScreen(sensor, onClose = { training = false })
                }
            }
        }
    }
}

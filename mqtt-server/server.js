const mqtt = require('mqtt');

// الاتصال بالـ broker
const client = mqtt.connect('mqtt://localhost:1883');

client.on('connect', () => {
    console.log('Connected to MQTT Broker');

    // subscribe على topic
    client.subscribe('esp32/data', (err) => {
        if (!err) {
            console.log('Subscribed to esp32/data');
        }
    });
});

// استقبال البيانات
client.on('message', (topic, message) => {
    console.log(`Received from ${topic}: ${message.toString()}`);

    // هنا تقدر تخزن في DB
});
const express = require('express');
const app = express();

app.get('/data', (req, res) => {
    res.send("Data from DB");
});

app.listen(3000, () => {
    console.log('API running on port 3000');
});
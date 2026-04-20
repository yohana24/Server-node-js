const mqtt = require('mqtt');

const client = mqtt.connect('mqtt://localhost:1883');

client.on('connect', () => {
    console.log('ESP32 connected');

    setInterval(() => {
        const temp = Math.floor(Math.random() * 15) + 20;
        const data = `temperature:${temp}`;

        client.publish('esp32/data', data);
        console.log('Sent:', data);
    }, 3000);
});
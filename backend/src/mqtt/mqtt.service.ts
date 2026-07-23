import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mqtt from 'mqtt';

@Injectable()
export class MqttService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MqttService.name);
  private client: mqtt.MqttClient;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const url = this.configService.getOrThrow<string>('MQTT_URL');
    this.client = mqtt.connect(url, {
      reconnectPeriod: 2000,
    });

    this.client.on('connect', () =>
      this.logger.log(`Connected to MQTT broker at ${url}`),
    );
    this.client.on('error', (err) =>
      this.logger.error(`MQTT error: ${err.message}`),
    );
    this.client.on('reconnect', () =>
      this.logger.warn('Reconnecting to MQTT broker...'),
    );
  }

  onModuleDestroy() {
    this.client?.end();
  }

  publish(topic: string, payload: unknown): Promise<void> {
    return new Promise((resolve, reject) => {
      this.client.publish(topic, JSON.stringify(payload), { qos: 1 }, (err) =>
        err ? reject(err) : resolve(),
      );
    });
  }
}

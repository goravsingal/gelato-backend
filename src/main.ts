import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable Swagger
  const config = new DocumentBuilder()
    .setTitle('Gelato Bridge API')
    .setDescription('API documentation for the Gelato Bridge project')
    .setVersion('1.0')
    .addTag('bridge') // You can categorize APIs with tags
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, document); // API docs available at /api

  // Enable CORS
  app.enableCors({
    origin: process.env.PUBLIC_UI_URL, // Allow frontend origin
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: 'Content-Type, Authorization',
    credentials: true, // If using cookies or authorization headers
  });

  await app.listen(3000);
  console.log(`Server running on http://localhost:3000`);
  console.log(`Swagger docs available at http://localhost:3000/api`);
}

bootstrap();

import * as ecs from '@aws-cdk/aws-ecs';
import * as cdk from '@aws-cdk/core';
import { FargateValidationFactory, IntrinsicValidator, Validation } from '..';
import { TestAlarms } from './test-alarms';
import { TestLambdas } from './test-lambdas';

const app = new cdk.App();
const stack = new cdk.Stack(app, 'CdkIntrinsicValidator', {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

// Create an ECS cluster to run some Fargate tasks in.
const cluster = new ecs.Cluster(stack, 'Cluster');

// A convenience tool for creating Fargate validations with common options
// (i.e., a specific ecs cluster.)
const fargateValidations = new FargateValidationFactory(stack, 'FargateValidationFactory', {
  cluster,
});

// Let's do some testing with the curl container image.
const curlImage = ecs.ContainerImage.fromRegistry('curlimages/curl:7.78.0');

const testAlarms = new TestAlarms(stack, 'TestAlarms');
const testLambdas = new TestLambdas(stack, 'TestLambdas');

// Validate the stack on every deploy and fail the deployment if any of
// the given validations fail so that CloudFormation can auto-rollback.
new IntrinsicValidator(stack, 'IntrinsicValidator', {
  validations: [
    // Test some public endpoints to see if they respond to HTTP:
    fargateValidations.runContainer({
      image: curlImage,
      command: ['https://www.example.com/'],
    }),
    fargateValidations.runContainer({
      // Add an optional label to help identity the validation.
      label: 'cURL the Front Page',
      image: curlImage,
      command: ['https://www.amazon.ca/'],
    }),

    // Monitor an alarm
    Validation.monitorAlarm({
      label: 'Monitor an alarm',
      alarm: testAlarms.neverAlarming,
      duration: cdk.Duration.seconds(30),
    }),

    // The following validations will fail and roll back the stack:
    // fargateValidations.runContainer(curlImage, 'https://fake.fake.fake/'),
    // Validation.alwaysFails(),

    // Test that a lambda invocation succeeds
    Validation.lambdaInvokeSucceeds({
      lambdaFunction: testLambdas.alwaysSucceeds,
      // lambdaFunction: testLambdas.alwaysFails,
    }),
  ],
});

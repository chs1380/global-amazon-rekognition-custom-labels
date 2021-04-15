import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import * as GlobalRekognitionCustomLabels from '../lib/global-rekognition-custom-labels-stack';

test('Empty Stack', () => {
    const app = new cdk.App();
    // WHEN
    const stack = new GlobalRekognitionCustomLabels.GlobalRekognitionCustomLabelsStack(app, 'MyTestStack');
    // THEN
    expectCDK(stack).to(matchTemplate({
      "Resources": {}
    }, MatchStyle.EXACT))
});

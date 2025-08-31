const cdk = require("aws-cdk-lib");
const ec2 = require("aws-cdk-lib/aws-ec2");
const autoscaling = require("aws-cdk-lib/aws-autoscaling");
const dynamodb = require("aws-cdk-lib/aws-dynamodb");
const cognito = require("aws-cdk-lib/aws-cognito");
const iam = require("aws-cdk-lib/aws-iam");

class InfraStack extends cdk.Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    // VPC
    const vpc = new ec2.Vpc(this, "Vpc", { maxAzs: 2 });

    // DynamoDB
    const table = new dynamodb.Table(this, "ItemsTable", {
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST
    });

    // Cognito User Pool
    const userPool = new cognito.UserPool(this, "UserPool", {
      selfSignUpEnabled: true,
      signInAliases: { email: true }
    });
    const userPoolClient = new cognito.UserPoolClient(this, "UserPoolClient", { userPool });

    // EC2 Role
    const role = new iam.Role(this, "Ec2Role", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com")
    });
    table.grantReadWriteData(role);
    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"));

    // Launch Template
    const lt = new ec2.LaunchTemplate(this, "LaunchTemplate", {
      instanceType: new ec2.InstanceType("t3.micro"),
      machineImage: ec2.MachineImage.latestAmazonLinux2(),
      role,
      userData: ec2.UserData.custom(`
        #!/bin/bash
        yum update -y
        curl -sL https://rpm.nodesource.com/setup_18.x | bash -
        yum install -y nodejs git
        git clone https://github.com/asifsha/ec2-api-db.git /home/ec2-user/app
        cd /home/ec2-user/app
        npm ci
        TABLE_NAME=${table.tableName} USER_POOL_ID=${userPool.userPoolId} AWS_REGION=${this.region} node src/app.js > app.log 2>&1 &
      `)
    });

    // Auto Scaling Group
    const asg = new autoscaling.AutoScalingGroup(this, "ASG", {
      vpc,
      launchTemplate: lt,
      minCapacity: 1,
      desiredCapacity: 2,
      maxCapacity: 3
    });

    // ✅ Rolling + Additional Batch Update Policy
    asg.applyUpdatePolicy(cdk.aws_autoscaling.UpdatePolicy.rollingUpdate({
      minInstancesInService: 1,
      maxBatchSize: 1,
      pauseTime: cdk.Duration.minutes(1),
      waitOnResourceSignals: false
    }));

    // ✅ Auto Scaling Policy (CPU-based)
    asg.scaleOnCpuUtilization("CpuScaling", {
      targetUtilizationPercent: 70, // scale out if avg CPU > 70%
      cooldown: cdk.Duration.minutes(5)
    });

    // Outputs
    new cdk.CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, "TableName", { value: table.tableName });
  }
}

module.exports = { InfraStack };

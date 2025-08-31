const cdk = require("aws-cdk-lib");
const ec2 = require("aws-cdk-lib/aws-ec2");
const asg = require("aws-cdk-lib/aws-autoscaling");
const elbv2 = require("aws-cdk-lib/aws-elasticloadbalancingv2");
const iam = require("aws-cdk-lib/aws-iam");
const dynamodb = require("aws-cdk-lib/aws-dynamodb");
const cognito = require("aws-cdk-lib/aws-cognito");
const codedeploy = require("aws-cdk-lib/aws-codedeploy");
const { Construct } = require("constructs");

class InfraStack extends cdk.Stack {
  /**
   * @param {Construct} scope
   * @param {string} id
   * @param {cdk.StackProps} props
   */
  constructor(scope, id, props) {
    super(scope, id, props);

    const region = cdk.Stack.of(this).region;

    // DynamoDB (on-demand = minimal cost)
    const table = new dynamodb.Table(this, "ItemsTable", {
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY // switch to RETAIN for prod
    });

    // Cognito
    const userPool = new cognito.UserPool(this, "UserPool", {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true }
    });
    const userPoolClient = new cognito.UserPoolClient(this, "UserPoolClient", {
      userPool,
      generateSecret: false
    });

    // VPC
    const vpc = new ec2.Vpc(this, "Vpc", { maxAzs: 2 });

    // Security groups
    const albSg = new ec2.SecurityGroup(this, "AlbSg", { vpc, allowAllOutbound: true });
    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), "HTTP in");

    const appSg = new ec2.SecurityGroup(this, "AppSg", { vpc, allowAllOutbound: true });
    appSg.addIngressRule(albSg, ec2.Port.tcp(3000), "ALB to app:3000");

    // Instance role
    const role = new iam.Role(this, "InstanceRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com")
    });
    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSSMManagedInstanceCore"));
    table.grantWriteData(role);

    // CodeDeploy permissions (broad for sample; narrow in prod)
    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("AWSCodeDeployFullAccess"));

    const instanceProfile = new iam.CfnInstanceProfile(this, "InstanceProfile", {
      roles: [role.roleName]
    });

    // User data: install CodeDeploy agent, Node.js, seed env
    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      "set -ex",
      "dnf install -y ruby wget",
      `cd /home/ec2-user`,
      `wget https://aws-codedeploy-${region}.s3.${region}.amazonaws.com/latest/install`,
      "chmod +x ./install && ./install auto",
      "systemctl enable codedeploy-agent && systemctl start codedeploy-agent",
      "curl -fsSL https://rpm.nodesource.com/setup_18.x | bash -",
      "dnf install -y nodejs",
      "mkdir -p /opt/app",
      `echo "TABLE_NAME=${table.tableName}" >> /etc/environment`,
      `echo "USER_POOL_ID=${userPool.userPoolId}" >> /etc/environment`,
      `echo "COGNITO_CLIENT_ID=${userPoolClient.userPoolClientId}" >> /etc/environment`,
      `echo "AWS_REGION=${region}" >> /etc/environment`,
      "export TABLE_NAME=$(grep TABLE_NAME /etc/environment | cut -d= -f2)",
      "export USER_POOL_ID=$(grep USER_POOL_ID /etc/environment | cut -d= -f2)",
      "export COGNITO_CLIENT_ID=$(grep COGNITO_CLIENT_ID /etc/environment | cut -d= -f2)",
      "export AWS_REGION=$(grep AWS_REGION /etc/environment | cut -d= -f2)"
    );

    // Launch template
    const lt = new ec2.LaunchTemplate(this, "LaunchTemplate", {
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      machineImage: ec2.MachineImage.latestAmazonLinux2023(),
      role,
      securityGroup: appSg,
      userData
    });

    // ASG (desired=2, max=3)
    const autoScalingGroup = new asg.AutoScalingGroup(this, "ApiAsg", {
      vpc,
      minCapacity: 1,
      desiredCapacity: 2,
      maxCapacity: 3,
      launchTemplate: lt
    });

    // Rolling update (additional batch style)
    // autoScalingGroup.applyUpdatePolicy(cdk.aws_autoscaling.UpdatePolicy.rollingUpdate({
    //   minInstancesInService: 1,
    //   maxBatchSize: 1,
    //   pauseTime: cdk.Duration.minutes(1),
    //   waitOnResourceSignals: false
    // }));

    autoScalingGroup.scaleOnCpuUtilization("CpuScaling", {
      targetUtilizationPercent: 70
    });

    // ALB
    const alb = new elbv2.ApplicationLoadBalancer(this, "Alb", {
      vpc,
      internetFacing: true,
      securityGroup: albSg
    });

    const targetGroup = new elbv2.ApplicationTargetGroup(this, "Tg", {
      vpc,
      targets: [autoScalingGroup],
      port: 3000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      healthCheck: { path: "/health", healthyHttpCodes: "200" }
    });

    const listener = alb.addListener("Http", { port: 80, open: true });
    listener.addTargetGroups("Forward", { targetGroups: [targetGroup] });

    // CodeDeploy app & group (in-place rolling with ALB)
    const cdApp = new codedeploy.ServerApplication(this, "CdApp", {
      applicationName: "Ec2NodeApiApp"
    });

    new codedeploy.ServerDeploymentGroup(this, "CdGroup", {
      application: cdApp,
      deploymentGroupName: "Ec2NodeApiDg",
      autoScalingGroups: [autoScalingGroup],
      installAgent: false, // installed in userData
      loadBalancer: codedeploy.LoadBalancer.application(targetGroup),
      deploymentConfig: codedeploy.ServerDeploymentConfig.HALF_AT_A_TIME // safe default
    });

    // Outputs
    new cdk.CfnOutput(this, "AlbUrl", { value: `http://${alb.loadBalancerDnsName}` });
    new cdk.CfnOutput(this, "UserPoolId", { value: userPool.userPoolId });
    new cdk.CfnOutput(this, "UserPoolClientId", { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, "TableName", { value: table.tableName });
  }
}

module.exports = { InfraStack };

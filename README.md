🚀 EC2 + DynamoDB + CodeDeploy Infrastructure (AWS CDK)

This project provisions a Node.js API backend hosted on EC2 with:

Amazon VPC with public-facing Application Load Balancer (ALB).

Auto Scaling Group (ASG) for running EC2 instances.

DynamoDB table for data storage (on-demand capacity).

CodeDeploy for seamless application deployments.

S3 Bucket for CodeDeploy artifacts.

Application Load Balancer 

IAM roles & permissions for EC2 to access DynamoDB + S3.

All resources are deployed using AWS CDK in JavaScript.

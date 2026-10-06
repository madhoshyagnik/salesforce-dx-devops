pipeline {
    agent any

    environment {
        // Dev Hub credentials configured in Jenkins Credentials Manager:
        // Option 1: JWT Flow (Recommended for Enterprise/Jenkins)
        //   - salesforce-jwt-key: Secret file (server.key)
        //   - salesforce-connected-app-client-id: Secret text (Consumer Key)
        //   - salesforce-devhub-username: Secret text (Dev Hub Admin Username)
        JWT_KEY = credentials('salesforce-jwt-key')
        HUB_CLIENT_ID = credentials('salesforce-connected-app-client-id')
        HUB_USERNAME = credentials('salesforce-devhub-username')

        // Scratch org alias scoped to current build
        SCRATCH_ORG_ALIAS = "jenkins_build_${BUILD_NUMBER}"
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Lint & Unit Tests') {
            steps {
                echo '=== Running Local LWC Jest Unit Tests & Linting ==='
                sh 'npm ci'
                sh 'npm run lint'
                sh 'npm test'
            }
        }

        stage('Authenticate Dev Hub') {
            steps {
                echo '=== Authenticating to Dev Hub via Headless JWT Flow ==='
                sh '''
                    sf org login jwt \
                        --client-id "${HUB_CLIENT_ID}" \
                        --jwt-key-file "${JWT_KEY}" \
                        --username "${HUB_USERNAME}" \
                        --alias DevHub \
                        --set-default-dev-hub
                '''
            }
        }

        stage('Create Ephemeral Scratch Org') {
            steps {
                echo "=== Creating Scratch Org: ${SCRATCH_ORG_ALIAS} ==="
                sh '''
                    sf org create scratch \
                        --target-dev-hub DevHub \
                        --definition-file config/project-scratch-def.json \
                        --alias "${SCRATCH_ORG_ALIAS}" \
                        --duration-days 1 \
                        --wait 10 \
                        --set-default
                '''
            }
        }

        stage('Deploy Metadata') {
            steps {
                echo '=== Deploying Source Metadata to Scratch Org ==='
                sh '''
                    sf project deploy start \
                        --target-org "${SCRATCH_ORG_ALIAS}" \
                        --wait 10
                '''
            }
        }

        stage('Run Apex Tests') {
            steps {
                echo '=== Running Apex Tests & Code Coverage ==='
                sh '''
                    mkdir -p test-results
                    sf apex run test \
                        --target-org "${SCRATCH_ORG_ALIAS}" \
                        --test-level RunLocalTests \
                        --code-coverage \
                        --result-format junit \
                        --output-dir test-results \
                        --wait 10
                '''
            }
            post {
                always {
                    junit allowEmptyResults: true, testResults: 'test-results/test-result-*.xml'
                }
            }
        }
    }

    post {
        always {
            echo "=== Tearing Down Ephemeral Scratch Org ==="
            sh '''
                sf org delete scratch \
                    --target-org "${SCRATCH_ORG_ALIAS}" \
                    --no-prompt || true
            '''
        }
        success {
            echo '=== Salesforce DX Pipeline Completed Successfully! ==='
        }
        failure {
            echo '=== Salesforce DX Pipeline Failed! ==='
        }
    }
}

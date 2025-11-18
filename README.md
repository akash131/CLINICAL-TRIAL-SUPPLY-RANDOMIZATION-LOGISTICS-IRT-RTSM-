# Clinical Trial IRT/RTSM Platform

A comprehensive, production-grade Clinical Trial Supply, Randomization & Logistics (IRT/RTSM) platform with vendor parity from top industry solutions.

## Features

### Core IRT/RTSM Capabilities

#### 🎲 Randomization Engine (Almac, Oracle, 4G Clinical, Signant parity)
- **Complex Randomization Algorithms**: Stratified, block, adaptive, response-adaptive randomization
- **No-Code Configuration**: Build randomization strategies without programming
- **Blinding Controls**: Single, double, triple-blind study support with emergency unblinding
- **Real-time Validation**: Automated validation of randomization lists
- **Biostatistical Integration**: Built-in statistical models and validation

#### 📦 Supply Chain Management (Oracle, Signant, 4G Clinical parity)
- **End-to-End Inventory Tracking**: Real-time visibility across depot, site, and patient levels
- **Drug Pooling**: Cross-study drug inventory sharing and optimization
- **Just-In-Time Labeling**: Dynamic kit labeling and assignment
- **Temperature Monitoring**: Continuous temperature tracking with automated excursion handling
- **Shipment Management**: Integrated logistics with carrier tracking
- **Barcode/RFID**: Complete labeling and tracking system

#### 🤖 AI-Powered Features (4G Clinical, Oracle parity)
- **Supply Forecasting**: ML-based demand prediction and inventory optimization
- **NLP Spec Interpretation**: Natural language processing for protocol specifications
- **Predictive Analytics**: Enrollment forecasting and site performance prediction
- **Smart Alerts**: Intelligent notification system for supply risks

#### 👥 Patient & Site Management (Signant, Veeva parity)
- **Patient Screening & Enrollment**: Comprehensive screening with eligibility checking
- **Cohort Management**: Advanced cohort creation and management
- **Site Portal**: Dedicated interface for research sites
- **Direct-to-Patient**: Home delivery integration with address management
- **Mobile Apps**: iOS and Android applications for site coordinators

#### 📊 Analytics & Reporting (Oracle, Veeva, Almac parity)
- **Real-Time Dashboards**: Cross-study analytics with customizable views
- **Enrollment Metrics**: Live enrollment tracking and forecasting
- **Supply Chain Analytics**: Inventory levels, usage patterns, wastage analysis
- **Site Performance**: Site activation, enrollment rates, compliance metrics
- **Regulatory Reports**: CFR Part 11 compliant reporting

#### 🔗 Integration Layer (Veeva, Oracle parity)
- **API-First Architecture**: RESTful and GraphQL APIs
- **EDC Integration**: Seamless connection with Electronic Data Capture systems
- **CTMS Integration**: Clinical Trial Management System connectivity
- **eTMF Integration**: Electronic Trial Master File integration
- **Third-Party Logistics**: Integration with major supply chain vendors (Almac, Fisher, Catalent, PMD, SAP)

#### 🔒 Security & Compliance (All vendor parity)
- **21 CFR Part 11 Compliance**: Full regulatory compliance with electronic signatures
- **HIPAA Compliance**: Protected health information security
- **GCP Compliance**: Good Clinical Practice adherence
- **RBAC**: Role-based access control with granular permissions
- **Audit Trail**: Complete audit logging with tamper-proof records
- **Data Encryption**: At-rest and in-transit encryption

#### 🌐 Advanced Capabilities
- **Multi-Language Support**: Internationalization (i18n) for global trials
- **24/7 Availability**: High-availability architecture with 99.9% uptime
- **Risk-Based Monitoring**: Automated risk assessment and mitigation
- **Decentralized Trial Support**: Hybrid and fully decentralized trial models
- **Emergency Unblinding**: Secure, audited emergency access procedures
- **Version Control**: Protocol amendment tracking and versioning

## Technology Stack

### Backend
- **Runtime**: Node.js 20+ with TypeScript
- **Framework**: Express.js with comprehensive middleware
- **Database**: PostgreSQL 16 with advanced indexing
- **Caching**: Redis for session and data caching
- **Search**: Elasticsearch for advanced querying
- **Messaging**: Apache Kafka for event streaming
- **Storage**: MinIO for object storage
- **ORM**: Prisma with type-safe queries

### Frontend
- **Framework**: React 18 with TypeScript
- **State Management**: Redux Toolkit with RTK Query
- **UI Library**: Material-UI (MUI) with custom theming
- **Charts**: Recharts and D3.js for visualizations
- **Forms**: React Hook Form with Zod validation
- **Routing**: React Router v6

### Mobile
- **Framework**: React Native with TypeScript
- **Navigation**: React Navigation
- **State**: Redux Toolkit

### DevOps
- **Containerization**: Docker with multi-stage builds
- **Orchestration**: Kubernetes-ready architecture
- **CI/CD**: GitHub Actions
- **Monitoring**: Sentry, New Relic integration
- **Testing**: Jest, React Testing Library, Cypress

## Quick Start

### Prerequisites
- Node.js 20+
- Docker and Docker Compose
- PostgreSQL 16 (if running locally)

### Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd CLINICAL-TRIAL-SUPPLY-RANDOMIZATION-LOGISTICS-IRT-RTSM-
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Start services with Docker**
```bash
npm run docker:up
```

5. **Run database migrations**
```bash
npm run db:migrate
```

6. **Seed initial data**
```bash
npm run db:seed
```

7. **Start development servers**
```bash
npm run dev
```

The application will be available at:
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:3000
- **API Documentation**: http://localhost:3000/api/docs
- **MinIO Console**: http://localhost:9001

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Frontend Layer                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Sponsor UI   │  │  Site Portal │  │ Mobile Apps  │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└─────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    API Gateway Layer                        │
│              (REST + GraphQL + WebSocket)                   │
└─────────────────────────────────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ Randomization│  │   Supply     │  │  Analytics   │
│   Service    │  │   Service    │  │   Service    │
└──────────────┘  └──────────────┘  └──────────────┘
        │                  │                  │
        ▼                  ▼                  ▼
┌─────────────────────────────────────────────────────────────┐
│                    Data Layer                               │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │PostgreSQL│  │  Redis   │  │Elastic   │  │  Kafka   │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## API Documentation

Interactive API documentation is available at `/api/docs` when running the backend server.

### Key Endpoints

- **Authentication**: `/api/v1/auth/*`
- **Studies**: `/api/v1/studies/*`
- **Randomization**: `/api/v1/randomization/*`
- **Supply**: `/api/v1/supply/*`
- **Sites**: `/api/v1/sites/*`
- **Patients**: `/api/v1/patients/*`
- **Analytics**: `/api/v1/analytics/*`
- **Integrations**: `/api/v1/integrations/*`

## Testing

```bash
# Run all tests
npm test

# Run backend tests
npm test --workspace=backend

# Run frontend tests
npm test --workspace=frontend

# Run e2e tests
npm run test:e2e

# Coverage report
npm run test:coverage
```

## Deployment

### Docker Production Build

```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Kubernetes

```bash
kubectl apply -f k8s/
```

## Vendor Feature Parity

| Feature | Almac | Signant | Veeva | Oracle | 4G Clinical | Our Platform |
|---------|-------|---------|-------|--------|-------------|--------------|
| Complex Randomization | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Supply Forecasting | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| Drug Pooling | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| AI/ML Features | ❌ | ✅ | ❌ | ✅ | ✅ | ✅ |
| NLP Spec Reading | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Direct-to-Patient | ❌ | ✅ | ❌ | ✅ | ❌ | ✅ |
| Mobile Apps | ❌ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Temperature Monitoring | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| API-First | ❌ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Real-time Analytics | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

## License

Proprietary - All Rights Reserved

## Support

For technical support, please contact: support@irt-rtsm-platform.com

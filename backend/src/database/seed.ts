/**
 * Database Seeder
 *
 * Populate database with sample data for development and testing
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Clean existing data (development only!)
  if (process.env.NODE_ENV === 'development') {
    console.log('Cleaning existing data...');
    await prisma.randomization.deleteMany();
    await prisma.patient.deleteMany();
    await prisma.inventory.deleteMany();
    await prisma.kit.deleteMany();
    await prisma.investigationalProduct.deleteMany();
    await prisma.treatmentArm.deleteMany();
    await prisma.studySite.deleteMany();
    await prisma.study.deleteMany();
    await prisma.site.deleteMany();
    await prisma.userStudy.deleteMany();
    await prisma.userSite.deleteMany();
    await prisma.userSession.deleteMany();
    await prisma.user.deleteMany();
    await prisma.organization.deleteMany();
  }

  // Create Organizations
  console.log('Creating organizations...');
  const sponsor = await prisma.organization.create({
    data: {
      name: 'Global Pharma Research Inc',
      type: 'SPONSOR',
      country: 'USA',
      address: '123 Research Blvd',
      phone: '+1-555-0100',
      email: 'contact@globalpharma.example.com',
      status: 'ACTIVE',
    },
  });

  const cro = await prisma.organization.create({
    data: {
      name: 'Clinical Research Organization',
      type: 'CRO',
      country: 'USA',
      address: '456 CRO Street',
      phone: '+1-555-0200',
      email: 'info@cro.example.com',
      status: 'ACTIVE',
    },
  });

  // Create Users
  console.log('Creating users...');
  const passwordHash = await bcrypt.hash('password123', 10);

  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@example.com',
      username: 'admin',
      passwordHash,
      firstName: 'Admin',
      lastName: 'User',
      role: 'SUPER_ADMIN',
      status: 'ACTIVE',
      organizationId: sponsor.id,
    },
  });

  const studyManager = await prisma.user.create({
    data: {
      email: 'manager@example.com',
      username: 'studymanager',
      passwordHash,
      firstName: 'Study',
      lastName: 'Manager',
      role: 'STUDY_MANAGER',
      status: 'ACTIVE',
      organizationId: sponsor.id,
    },
  });

  const siteCoordinator = await prisma.user.create({
    data: {
      email: 'coordinator@example.com',
      username: 'coordinator',
      passwordHash,
      firstName: 'Site',
      lastName: 'Coordinator',
      role: 'SITE_COORDINATOR',
      status: 'ACTIVE',
    },
  });

  // Create Study
  console.log('Creating study...');
  const study = await prisma.study.create({
    data: {
      protocolNumber: 'PROTO-2024-001',
      title: 'Phase III Study of Novel Treatment for Disease X',
      description: 'A randomized, double-blind, placebo-controlled study',
      phase: 'PHASE_III',
      indication: 'Disease X',
      sponsorId: sponsor.id,
      status: 'ENROLLING',
      blindingType: 'DOUBLE_BLIND',
      numberOfArms: 2,
      targetEnrollment: 300,
      startDate: new Date('2024-01-01'),
      randomizationConfig: {
        algorithm: 'STRATIFIED_BLOCK',
        blockSize: 4,
        allocationRatio: '1:1',
      },
    },
  });

  // Create Treatment Arms
  console.log('Creating treatment arms...');
  const armA = await prisma.treatmentArm.create({
    data: {
      studyId: study.id,
      name: 'Active Treatment',
      code: 'ARM-A',
      description: 'Novel drug treatment',
      isActive: true,
    },
  });

  const armB = await prisma.treatmentArm.create({
    data: {
      studyId: study.id,
      name: 'Placebo',
      code: 'ARM-B',
      description: 'Placebo control',
      isActive: true,
    },
  });

  // Create Sites
  console.log('Creating sites...');
  const sites = await Promise.all([
    prisma.site.create({
      data: {
        siteNumber: 'SITE-001',
        name: 'Boston Medical Center',
        organizationId: cro.id,
        country: 'USA',
        region: 'Northeast',
        city: 'Boston',
        address: '123 Medical Plaza',
        zipCode: '02115',
        phone: '+1-617-555-0001',
        email: 'site001@example.com',
        principalInvestigator: 'Dr. John Smith',
        status: 'ACTIVATED',
        activationDate: new Date('2024-01-15'),
      },
    }),
    prisma.site.create({
      data: {
        siteNumber: 'SITE-002',
        name: 'San Francisco General Hospital',
        organizationId: cro.id,
        country: 'USA',
        region: 'West',
        city: 'San Francisco',
        address: '456 Health Ave',
        zipCode: '94110',
        phone: '+1-415-555-0002',
        email: 'site002@example.com',
        principalInvestigator: 'Dr. Jane Doe',
        status: 'ACTIVATED',
        activationDate: new Date('2024-01-20'),
      },
    }),
    prisma.site.create({
      data: {
        siteNumber: 'SITE-003',
        name: 'New York Clinical Research',
        organizationId: cro.id,
        country: 'USA',
        region: 'Northeast',
        city: 'New York',
        address: '789 Research Way',
        zipCode: '10001',
        phone: '+1-212-555-0003',
        email: 'site003@example.com',
        principalInvestigator: 'Dr. Michael Johnson',
        status: 'ACTIVATED',
        activationDate: new Date('2024-02-01'),
      },
    }),
  ]);

  // Link sites to study
  console.log('Linking sites to study...');
  for (const site of sites) {
    await prisma.studySite.create({
      data: {
        studyId: study.id,
        siteId: site.id,
        targetEnrollment: 100,
        activationDate: site.activationDate,
        status: 'ACTIVATED',
      },
    });
  }

  // Create Investigational Products
  console.log('Creating investigational products...');
  const productA = await prisma.investigationalProduct.create({
    data: {
      name: 'Study Drug XYZ-123',
      code: 'XYZ-123',
      treatmentArmId: armA.id,
      description: 'Active pharmaceutical ingredient',
      dosageForm: 'Tablet',
      strength: '100mg',
      packagingType: 'Bottle',
      unitsPerKit: 30,
      storageConditions: 'Store at 15-25°C',
      shelfLifeDays: 730,
      requiresRefrigeration: false,
    },
  });

  const productB = await prisma.investigationalProduct.create({
    data: {
      name: 'Placebo Tablet',
      code: 'PLACEBO-001',
      treatmentArmId: armB.id,
      description: 'Matching placebo',
      dosageForm: 'Tablet',
      strength: 'N/A',
      packagingType: 'Bottle',
      unitsPerKit: 30,
      storageConditions: 'Store at 15-25°C',
      shelfLifeDays: 730,
      requiresRefrigeration: false,
    },
  });

  // Create Kits
  console.log('Creating kits...');
  const kits = [];
  for (let i = 1; i <= 100; i++) {
    const product = i % 2 === 0 ? productA : productB;
    const kit = await prisma.kit.create({
      data: {
        kitNumber: `KIT-${String(i).padStart(6, '0')}`,
        productId: product.id,
        batchNumber: `BATCH-2024-${Math.floor(i / 10) + 1}`,
        expiryDate: new Date('2026-12-31'),
        manufacturingDate: new Date('2024-01-01'),
        status: 'AVAILABLE',
        labelType: 'PRE_LABELED',
        labeledDate: new Date('2024-01-10'),
      },
    });
    kits.push(kit);
  }

  // Create Inventory
  console.log('Creating inventory...');
  for (let i = 0; i < kits.length; i++) {
    const site = sites[i % sites.length];
    await prisma.inventory.create({
      data: {
        studyId: study.id,
        siteId: site.id,
        kitId: kits[i].id,
        quantity: 1,
        location: `SHELF-${Math.floor(i / 10) + 1}`,
        status: 'AVAILABLE',
        receivedDate: new Date('2024-02-01'),
      },
    });
  }

  // Create Patients
  console.log('Creating patients...');
  const patients = [];
  for (let i = 1; i <= 50; i++) {
    const site = sites[i % sites.length];
    const patient = await prisma.patient.create({
      data: {
        studyId: study.id,
        siteId: site.id,
        patientNumber: `PT-${String(i).padStart(4, '0')}`,
        screeningNumber: `SCR-${String(i).padStart(4, '0')}`,
        initials: `${String.fromCharCode(65 + (i % 26))}${String.fromCharCode(65 + ((i * 2) % 26))}`,
        dateOfBirth: new Date(1970 + (i % 40), (i % 12), (i % 28) + 1),
        gender: i % 2 === 0 ? 'MALE' : 'FEMALE',
        enrollmentDate: new Date(2024, 1, 1 + i),
        status: i <= 30 ? 'RANDOMIZED' : 'ENROLLED',
        stratificationFactors: {
          age_group: i % 3 === 0 ? 'young' : i % 3 === 1 ? 'middle' : 'senior',
          disease_severity: i % 2 === 0 ? 'mild' : 'moderate',
        },
      },
    });
    patients.push(patient);
  }

  // Create Randomizations (for first 30 patients)
  console.log('Creating randomizations...');
  for (let i = 0; i < 30; i++) {
    const patient = patients[i];
    const arm = i % 2 === 0 ? armA : armB;

    await prisma.randomization.create({
      data: {
        studyId: study.id,
        patientId: patient.id,
        randomizationNumber: `RAND-${String(i + 1).padStart(6, '0')}`,
        treatmentArmCode: arm.code,
        stratumCode: `${patient.stratificationFactors.age_group}|${patient.stratificationFactors.disease_severity}`,
        blockNumber: Math.floor(i / 4) + 1,
        randomizationDate: new Date(2024, 1, 2 + i),
        algorithm: 'STRATIFIED_BLOCK',
        performedBy: studyManager.id,
      },
    });

    // Update patient with treatment arm
    await prisma.patient.update({
      where: { id: patient.id },
      data: {
        treatmentArmId: arm.id,
        randomizationDate: new Date(2024, 1, 2 + i),
      },
    });
  }

  // Create User Assignments
  console.log('Creating user assignments...');
  await prisma.userStudy.create({
    data: {
      userId: studyManager.id,
      studyId: study.id,
    },
  });

  for (const site of sites) {
    await prisma.userSite.create({
      data: {
        userId: siteCoordinator.id,
        siteId: site.id,
      },
    });
  }

  console.log('✅ Database seeding completed successfully!');
  console.log('\nTest Users:');
  console.log('  Admin: admin@example.com / password123');
  console.log('  Study Manager: manager@example.com / password123');
  console.log('  Site Coordinator: coordinator@example.com / password123');
  console.log(`\nCreated:`);
  console.log(`  ${2} Organizations`);
  console.log(`  ${3} Users`);
  console.log(`  ${1} Study`);
  console.log(`  ${2} Treatment Arms`);
  console.log(`  ${sites.length} Sites`);
  console.log(`  ${kits.length} Kits`);
  console.log(`  ${patients.length} Patients`);
  console.log(`  ${30} Randomizations`);
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

/**
 * CDISC/SDTM Export Service
 *
 * Clinical Data Interchange Standards Consortium (CDISC)
 * Study Data Tabulation Model (SDTM) export for regulatory submissions
 * Vendor parity: All major vendors (regulatory compliance)
 */

import { prisma } from '../database/connection';
import { logger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

interface SDTMDomain {
  domain: string;
  description: string;
  class: 'EVENTS' | 'INTERVENTIONS' | 'FINDINGS' | 'TRIAL_DESIGN' | 'SPECIAL_PURPOSE';
  records: SDTMRecord[];
}

interface SDTMRecord {
  [key: string]: string | number | Date | null;
}

class CDISCService {
  private exportDir = process.env.EXPORTS_DIR || './exports/cdisc';

  constructor() {
    if (!fs.existsSync(this.exportDir)) {
      fs.mkdirSync(this.exportDir, { recursive: true });
    }
  }

  /**
   * Export study data in SDTM format
   */
  async exportSDTM(studyId: string): Promise<string> {
    logger.info(`Exporting SDTM data for study ${studyId}`);

    const study = await prisma.study.findUnique({
      where: { id: studyId },
      include: {
        sponsor: true,
        arms: true,
        patients: true,
        randomizations: true,
      },
    });

    if (!study) {
      throw new Error('Study not found');
    }

    const domains: SDTMDomain[] = [];

    // Demographics (DM) domain
    const dmDomain = await this.generateDMDomain(study);
    domains.push(dmDomain);

    // Randomization (RANDOM) domain (custom domain)
    const randomDomain = await this.generateRANDOMDomain(study);
    domains.push(randomDomain);

    // Disposition (DS) domain
    const dsDomain = await this.generateDSDomain(study);
    domains.push(dsDomain);

    // Exposure (EX) domain
    const exDomain = await this.generateEXDomain(study);
    domains.push(exDomain);

    // Trial Design domains
    const tdDomains = await this.generateTrialDesignDomains(study);
    domains.push(...tdDomains);

    // Write to SAS XPT files
    const exportPath = await this.writeToDisk(study.protocolNumber, domains);

    logger.info(`SDTM export complete: ${exportPath}`);

    return exportPath;
  }

  /**
   * Generate Demographics (DM) domain
   */
  private async generateDMDomain(study: any): Promise<SDTMDomain> {
    const records: SDTMRecord[] = study.patients.map((patient: any, index: number) => ({
      STUDYID: study.protocolNumber,
      DOMAIN: 'DM',
      USUBJID: `${study.protocolNumber}-${patient.patientNumber}`,
      SUBJID: patient.patientNumber,
      RFSTDTC: patient.enrollmentDate?.toISOString().split('T')[0] || '',
      RFENDTC: patient.completionDate?.toISOString().split('T')[0] || '',
      SITEID: patient.siteId,
      AGE: this.calculateAge(patient.dateOfBirth),
      AGEU: 'YEARS',
      SEX: this.mapGender(patient.gender),
      RACE: patient.ethnicity || '',
      ARMCD: patient.treatmentArmId || '',
      ARM: '', // Would be populated from treatment arm
      COUNTRY: '', // Would be from site
      DMDTC: patient.enrollmentDate?.toISOString().split('T')[0] || '',
      DMDY: 1,
    }));

    return {
      domain: 'DM',
      description: 'Demographics',
      class: 'SPECIAL_PURPOSE',
      records,
    };
  }

  /**
   * Generate Randomization domain (custom)
   */
  private async generateRANDOMDomain(study: any): Promise<SDTMDomain> {
    const records: SDTMRecord[] = study.randomizations.map((rand: any) => ({
      STUDYID: study.protocolNumber,
      DOMAIN: 'RANDOM',
      USUBJID: `${study.protocolNumber}-${rand.patient?.patientNumber}`,
      RANDSEQ: rand.randomizationNumber,
      RANDDT: rand.randomizationDate.toISOString().split('T')[0],
      RANDTRT: rand.treatmentArmCode,
      RANDSTRT: rand.stratumCode || '',
      RANDALG: rand.algorithm,
      RANDBLK: rand.blockNumber || '',
    }));

    return {
      domain: 'RANDOM',
      description: 'Randomization',
      class: 'EVENTS',
      records,
    };
  }

  /**
   * Generate Disposition (DS) domain
   */
  private async generateDSDomain(study: any): Promise<SDTMDomain> {
    const records: SDTMRecord[] = [];

    study.patients.forEach((patient: any) => {
      // Enrollment record
      records.push({
        STUDYID: study.protocolNumber,
        DOMAIN: 'DS',
        USUBJID: `${study.protocolNumber}-${patient.patientNumber}`,
        DSSEQ: 1,
        DSTERM: 'ENROLLED',
        DSDECOD: 'ENROLLED',
        DSCAT: 'DISPOSITION EVENT',
        DSSTDTC: patient.enrollmentDate?.toISOString().split('T')[0] || '',
      });

      // Randomization record
      if (patient.randomizationDate) {
        records.push({
          STUDYID: study.protocolNumber,
          DOMAIN: 'DS',
          USUBJID: `${study.protocolNumber}-${patient.patientNumber}`,
          DSSEQ: 2,
          DSTERM: 'RANDOMIZED',
          DSDECOD: 'RANDOMIZED',
          DSCAT: 'DISPOSITION EVENT',
          DSSTDTC: patient.randomizationDate.toISOString().split('T')[0],
        });
      }

      // Completion/Withdrawal record
      if (patient.status === 'COMPLETED' || patient.status === 'WITHDRAWN') {
        records.push({
          STUDYID: study.protocolNumber,
          DOMAIN: 'DS',
          USUBJID: `${study.protocolNumber}-${patient.patientNumber}`,
          DSSEQ: 3,
          DSTERM: patient.status,
          DSDECOD: patient.status,
          DSCAT: 'DISPOSITION EVENT',
          DSSTDTC: patient.completionDate?.toISOString().split('T')[0] || '',
        });
      }
    });

    return {
      domain: 'DS',
      description: 'Disposition',
      class: 'EVENTS',
      records,
    };
  }

  /**
   * Generate Exposure (EX) domain
   */
  private async generateEXDomain(study: any): Promise<SDTMDomain> {
    // In production, this would include dispensation records

    return {
      domain: 'EX',
      description: 'Exposure',
      class: 'INTERVENTIONS',
      records: [],
    };
  }

  /**
   * Generate Trial Design domains (TA, TE, TV, etc.)
   */
  private async generateTrialDesignDomains(study: any): Promise<SDTMDomain[]> {
    const domains: SDTMDomain[] = [];

    // Trial Arms (TA)
    const taRecords: SDTMRecord[] = study.arms.map((arm: any, index: number) => ({
      STUDYID: study.protocolNumber,
      DOMAIN: 'TA',
      ARMCD: arm.code,
      ARM: arm.name,
      TAETORD: index + 1,
      ETCD: 'TREATMENT',
      ELEMENT: arm.description || arm.name,
      TABRANCH: '',
      TATRANS: '',
      EPOCH: 'TREATMENT',
    }));

    domains.push({
      domain: 'TA',
      description: 'Trial Arms',
      class: 'TRIAL_DESIGN',
      records: taRecords,
    });

    // Trial Summary (TS)
    const tsRecords: SDTMRecord[] = [
      {
        STUDYID: study.protocolNumber,
        DOMAIN: 'TS',
        TSSEQ: 1,
        TSPARMCD: 'TITLE',
        TSPARM: 'Trial Title',
        TSVAL: study.title,
      },
      {
        STUDYID: study.protocolNumber,
        DOMAIN: 'TS',
        TSSEQ: 2,
        TSPARMCD: 'PHASE',
        TSPARM: 'Trial Phase',
        TSVAL: study.phase,
      },
      {
        STUDYID: study.protocolNumber,
        DOMAIN: 'TS',
        TSSEQ: 3,
        TSPARMCD: 'SPONSOR',
        TSPARM: 'Clinical Study Sponsor',
        TSVAL: study.sponsor.name,
      },
      {
        STUDYID: study.protocolNumber,
        DOMAIN: 'TS',
        TSSEQ: 4,
        TSPARMCD: 'INDIC',
        TSPARM: 'Trial Disease/Condition Being Studied',
        TSVAL: study.indication,
      },
      {
        STUDYID: study.protocolNumber,
        DOMAIN: 'TS',
        TSSEQ: 5,
        TSPARMCD: 'BLIND',
        TSPARM: 'Trial Blinding Schema',
        TSVAL: study.blindingType,
      },
    ];

    domains.push({
      domain: 'TS',
      description: 'Trial Summary',
      class: 'TRIAL_DESIGN',
      records: tsRecords,
    });

    return domains;
  }

  /**
   * Write domains to disk (CSV format - production would use SAS XPT)
   */
  private async writeToDisk(protocolNumber: string, domains: SDTMDomain[]): Promise<string> {
    const exportFolder = path.join(this.exportDir, `${protocolNumber}_${Date.now()}`);
    fs.mkdirSync(exportFolder, { recursive: true });

    for (const domain of domains) {
      const filename = `${domain.domain.toLowerCase()}.csv`;
      const filepath = path.join(exportFolder, filename);

      if (domain.records.length === 0) {
        logger.info(`Skipping empty domain: ${domain.domain}`);
        continue;
      }

      // Get column headers from first record
      const headers = Object.keys(domain.records[0]);

      // Create CSV content
      const csvLines = [headers.join(',')];

      domain.records.forEach(record => {
        const values = headers.map(header => {
          const value = record[header];
          if (value === null || value === undefined) return '';
          if (typeof value === 'string' && value.includes(',')) {
            return `"${value}"`;
          }
          return value.toString();
        });
        csvLines.push(values.join(','));
      });

      fs.writeFileSync(filepath, csvLines.join('\n'), 'utf-8');
      logger.info(`Written ${domain.domain} domain: ${domain.records.length} records`);
    }

    // Create define.xml (metadata)
    await this.generateDefineXML(exportFolder, protocolNumber, domains);

    return exportFolder;
  }

  /**
   * Generate define.xml (CDISC metadata)
   */
  private async generateDefineXML(
    exportFolder: string,
    studyId: string,
    domains: SDTMDomain[]
  ): Promise<void> {
    const defineXML = `<?xml version="1.0" encoding="UTF-8"?>
<ODM xmlns="http://www.cdisc.org/ns/odm/v1.3"
     xmlns:xlink="http://www.w3.org/1999/xlink"
     xmlns:def="http://www.cdisc.org/ns/def/v2.0"
     FileType="Snapshot"
     FileOID="define.${studyId}"
     CreationDateTime="${new Date().toISOString()}"
     ODMVersion="1.3.2"
     Originator="IRT/RTSM Platform">

  <Study OID="${studyId}">
    <GlobalVariables>
      <StudyName>${studyId}</StudyName>
      <StudyDescription>Clinical Trial Data - SDTM</StudyDescription>
      <ProtocolName>${studyId}</ProtocolName>
    </GlobalVariables>

    <MetaDataVersion OID="SDTM.1.0" Name="SDTM v1.0">
      ${domains.map(domain => this.generateItemGroupDef(domain)).join('\n      ')}
    </MetaDataVersion>
  </Study>
</ODM>`;

    const filepath = path.join(exportFolder, 'define.xml');
    fs.writeFileSync(filepath, defineXML, 'utf-8');

    logger.info('define.xml generated');
  }

  /**
   * Generate ItemGroupDef for define.xml
   */
  private generateItemGroupDef(domain: SDTMDomain): string {
    if (domain.records.length === 0) return '';

    const variables = Object.keys(domain.records[0]);

    return `<ItemGroupDef OID="${domain.domain}" Name="${domain.domain}" Repeating="Yes" Domain="${domain.domain}">
        <Description><TranslatedText>${domain.description}</TranslatedText></Description>
        ${variables.map((v, i) => `<ItemRef ItemOID="${domain.domain}.${v}" OrderNumber="${i + 1}" Mandatory="No"/>`).join('\n        ')}
      </ItemGroupDef>`;
  }

  /**
   * Helper: Calculate age from date of birth
   */
  private calculateAge(dateOfBirth: Date): number {
    const today = new Date();
    let age = today.getFullYear() - dateOfBirth.getFullYear();
    const monthDiff = today.getMonth() - dateOfBirth.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dateOfBirth.getDate())) {
      age--;
    }

    return age;
  }

  /**
   * Helper: Map gender to CDISC controlled terminology
   */
  private mapGender(gender: string): string {
    const mapping: Record<string, string> = {
      MALE: 'M',
      FEMALE: 'F',
      OTHER: 'U',
      UNKNOWN: 'U',
    };

    return mapping[gender] || 'U';
  }
}

export default new CDISCService();

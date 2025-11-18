/**
 * NLP Protocol Interpreter Service
 *
 * Natural Language Processing for protocol specification interpretation
 * Vendor parity: 4G Clinical Prancer (NLP to read and interpret RTSM specs)
 */

import { logger } from '../utils/logger';

interface ProtocolSpec {
  studyId: string;
  protocolText: string;
  version: string;
}

interface ExtractedSpec {
  studyDesign: {
    phase: string;
    blindingType: string;
    numberOfArms: number;
    targetEnrollment: number;
  };
  randomization: {
    algorithm: string;
    blockSize?: number;
    allocationRatio: string;
    stratificationFactors?: string[];
  };
  treatmentArms: Array<{
    name: string;
    code: string;
    description: string;
  }>;
  inclusionCriteria: string[];
  exclusionCriteria: string[];
  endpoints: {
    primary: string[];
    secondary: string[];
  };
  visitSchedule: Array<{
    visitNumber: number;
    visitName: string;
    timepoint: string;
    procedures: string[];
  }>;
  supplyRequirements: {
    investigationalProduct: string;
    dosageForm: string;
    packaging: string;
    storageConditions: string;
  };
}

class NLPService {
  /**
   * Parse protocol specification using NLP
   */
  async parseProtocolSpec(spec: ProtocolSpec): Promise<ExtractedSpec> {
    logger.info(`Parsing protocol spec for study ${spec.studyId}`);

    const text = spec.protocolText.toLowerCase();

    // Extract study design
    const studyDesign = this.extractStudyDesign(text);

    // Extract randomization parameters
    const randomization = this.extractRandomization(text);

    // Extract treatment arms
    const treatmentArms = this.extractTreatmentArms(text);

    // Extract inclusion/exclusion criteria
    const inclusionCriteria = this.extractCriteria(text, 'inclusion');
    const exclusionCriteria = this.extractCriteria(text, 'exclusion');

    // Extract endpoints
    const endpoints = this.extractEndpoints(text);

    // Extract visit schedule
    const visitSchedule = this.extractVisitSchedule(text);

    // Extract supply requirements
    const supplyRequirements = this.extractSupplyRequirements(text);

    return {
      studyDesign,
      randomization,
      treatmentArms,
      inclusionCriteria,
      exclusionCriteria,
      endpoints,
      visitSchedule,
      supplyRequirements,
    };
  }

  /**
   * Extract study design information
   */
  private extractStudyDesign(text: string): any {
    const design: any = {
      phase: 'PHASE_II',
      blindingType: 'DOUBLE_BLIND',
      numberOfArms: 2,
      targetEnrollment: 100,
    };

    // Extract phase
    if (text.includes('phase 1') || text.includes('phase i')) {
      design.phase = 'PHASE_I';
    } else if (text.includes('phase 2') || text.includes('phase ii')) {
      design.phase = 'PHASE_II';
    } else if (text.includes('phase 3') || text.includes('phase iii')) {
      design.phase = 'PHASE_III';
    } else if (text.includes('phase 4') || text.includes('phase iv')) {
      design.phase = 'PHASE_IV';
    }

    // Extract blinding type
    if (text.includes('open-label') || text.includes('open label')) {
      design.blindingType = 'OPEN_LABEL';
    } else if (text.includes('single-blind') || text.includes('single blind')) {
      design.blindingType = 'SINGLE_BLIND';
    } else if (text.includes('double-blind') || text.includes('double blind')) {
      design.blindingType = 'DOUBLE_BLIND';
    } else if (text.includes('triple-blind') || text.includes('triple blind')) {
      design.blindingType = 'TRIPLE_BLIND';
    }

    // Extract number of arms
    const armsMatch = text.match(/(\d+)\s*arm[s]?/);
    if (armsMatch) {
      design.numberOfArms = parseInt(armsMatch[1]);
    }

    // Extract target enrollment
    const enrollmentMatch = text.match(/(\d+)\s*(subjects?|patients?|participants?)/);
    if (enrollmentMatch) {
      design.targetEnrollment = parseInt(enrollmentMatch[1]);
    }

    return design;
  }

  /**
   * Extract randomization parameters
   */
  private extractRandomization(text: string): any {
    const randomization: any = {
      algorithm: 'BLOCK',
      allocationRatio: '1:1',
    };

    // Extract algorithm
    if (text.includes('simple random')) {
      randomization.algorithm = 'SIMPLE';
    } else if (text.includes('block random') || text.includes('blocked random')) {
      randomization.algorithm = 'BLOCK';
    } else if (text.includes('stratified')) {
      randomization.algorithm = 'STRATIFIED_BLOCK';
    } else if (text.includes('minimization')) {
      randomization.algorithm = 'MINIMIZATION';
    } else if (text.includes('adaptive')) {
      randomization.algorithm = 'RESPONSE_ADAPTIVE';
    }

    // Extract block size
    const blockMatch = text.match(/block\s*size\s*(?:of\s*)?(\d+)/);
    if (blockMatch) {
      randomization.blockSize = parseInt(blockMatch[1]);
    }

    // Extract allocation ratio
    const ratioMatch = text.match(/(\d+:\d+(?::\d+)?)\s*(?:ratio|allocation)/);
    if (ratioMatch) {
      randomization.allocationRatio = ratioMatch[1];
    }

    // Extract stratification factors
    if (randomization.algorithm === 'STRATIFIED_BLOCK') {
      randomization.stratificationFactors = this.extractStratificationFactors(text);
    }

    return randomization;
  }

  /**
   * Extract stratification factors
   */
  private extractStratificationFactors(text: string): string[] {
    const factors: string[] = [];

    // Common stratification factors
    const commonFactors = [
      'age',
      'gender',
      'sex',
      'race',
      'ethnicity',
      'disease stage',
      'disease severity',
      'baseline score',
      'prior therapy',
      'geographic region',
      'site',
    ];

    commonFactors.forEach(factor => {
      if (text.includes(`stratified by ${factor}`) ||
          text.includes(`stratification factor: ${factor}`)) {
        factors.push(factor);
      }
    });

    return factors;
  }

  /**
   * Extract treatment arms
   */
  private extractTreatmentArms(text: string): any[] {
    const arms: any[] = [];

    // Look for arm descriptions
    const armPatterns = [
      /arm\s*([a-z])[:\s]+([^.]+)/gi,
      /treatment\s*([a-z])[:\s]+([^.]+)/gi,
      /group\s*([a-z])[:\s]+([^.]+)/gi,
    ];

    armPatterns.forEach(pattern => {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        arms.push({
          name: `Arm ${match[1].toUpperCase()}`,
          code: `ARM-${match[1].toUpperCase()}`,
          description: match[2].trim(),
        });
      }
    });

    // If no arms found, create default arms
    if (arms.length === 0) {
      arms.push(
        { name: 'Arm A', code: 'ARM-A', description: 'Treatment arm' },
        { name: 'Arm B', code: 'ARM-B', description: 'Control arm' }
      );
    }

    return arms;
  }

  /**
   * Extract inclusion/exclusion criteria
   */
  private extractCriteria(text: string, type: 'inclusion' | 'exclusion'): string[] {
    const criteria: string[] = [];

    // Find the section
    const sectionPattern = type === 'inclusion'
      ? /inclusion criteria[:\s]+([\s\S]*?)(?:exclusion criteria|endpoints|objectives)/i
      : /exclusion criteria[:\s]+([\s\S]*?)(?:endpoints|objectives|study procedures)/i;

    const sectionMatch = text.match(sectionPattern);
    if (!sectionMatch) return criteria;

    const section = sectionMatch[1];

    // Extract numbered or bulleted items
    const itemPatterns = [
      /\d+\.\s+([^\n]+)/g,
      /[•\-]\s+([^\n]+)/g,
    ];

    itemPatterns.forEach(pattern => {
      const matches = section.matchAll(pattern);
      for (const match of matches) {
        criteria.push(match[1].trim());
      }
    });

    return criteria;
  }

  /**
   * Extract endpoints
   */
  private extractEndpoints(text: string): any {
    const endpoints = {
      primary: [] as string[],
      secondary: [] as string[],
    };

    // Extract primary endpoints
    const primaryMatch = text.match(/primary\s+(?:endpoint|outcome)[:\s]+([\s\S]*?)(?:secondary|study|safety)/i);
    if (primaryMatch) {
      const items = primaryMatch[1].match(/[•\-\d+\.]\s*([^\n]+)/g);
      if (items) {
        endpoints.primary = items.map(item => item.replace(/^[•\-\d+\.]\s*/, '').trim());
      }
    }

    // Extract secondary endpoints
    const secondaryMatch = text.match(/secondary\s+(?:endpoint|outcome)[:\s]+([\s\S]*?)(?:safety|study|procedure)/i);
    if (secondaryMatch) {
      const items = secondaryMatch[1].match(/[•\-\d+\.]\s*([^\n]+)/g);
      if (items) {
        endpoints.secondary = items.map(item => item.replace(/^[•\-\d+\.]\s*/, '').trim());
      }
    }

    return endpoints;
  }

  /**
   * Extract visit schedule
   */
  private extractVisitSchedule(text: string): any[] {
    const visits: any[] = [];

    // Common visit patterns
    const visitPatterns = [
      /visit\s*(\d+)[:\s]+([^,]+),?\s*(?:day|week|month)?\s*(\d+)?/gi,
      /day\s*(\d+)[:\s]+([^.]+)/gi,
      /week\s*(\d+)[:\s]+([^.]+)/gi,
    ];

    visitPatterns.forEach(pattern => {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        visits.push({
          visitNumber: visits.length + 1,
          visitName: match[2].trim(),
          timepoint: match[3] || match[1],
          procedures: [],
        });
      }
    });

    return visits;
  }

  /**
   * Extract supply requirements
   */
  private extractSupplyRequirements(text: string): any {
    const requirements: any = {
      investigationalProduct: '',
      dosageForm: '',
      packaging: '',
      storageConditions: '',
    };

    // Extract investigational product
    const productMatch = text.match(/investigational\s+(?:product|drug|device)[:\s]+([^.]+)/i);
    if (productMatch) {
      requirements.investigationalProduct = productMatch[1].trim();
    }

    // Extract dosage form
    const dosageMatch = text.match(/dosage\s+form[:\s]+([^.]+)/i);
    if (dosageMatch) {
      requirements.dosageForm = dosageMatch[1].trim();
    } else if (text.includes('tablet')) {
      requirements.dosageForm = 'Tablet';
    } else if (text.includes('capsule')) {
      requirements.dosageForm = 'Capsule';
    } else if (text.includes('injection')) {
      requirements.dosageForm = 'Injection';
    }

    // Extract packaging
    const packagingMatch = text.match(/packaging[:\s]+([^.]+)/i);
    if (packagingMatch) {
      requirements.packaging = packagingMatch[1].trim();
    }

    // Extract storage conditions
    const storageMatch = text.match(/storage[:\s]+([^.]+)/i);
    if (storageMatch) {
      requirements.storageConditions = storageMatch[1].trim();
    } else if (text.includes('refrigerat')) {
      requirements.storageConditions = 'Refrigerated (2-8°C)';
    } else if (text.includes('room temperature')) {
      requirements.storageConditions = 'Room temperature (15-25°C)';
    } else if (text.includes('frozen')) {
      requirements.storageConditions = 'Frozen (-20°C or below)';
    }

    return requirements;
  }

  /**
   * Generate RTSM configuration from parsed spec
   */
  async generateRTSMConfig(extractedSpec: ExtractedSpec): Promise<any> {
    logger.info('Generating RTSM configuration from parsed protocol');

    const config = {
      studyDesign: extractedSpec.studyDesign,
      randomization: {
        algorithm: extractedSpec.randomization.algorithm,
        config: {
          blockSize: extractedSpec.randomization.blockSize,
          allocationRatio: extractedSpec.randomization.allocationRatio,
          totalSampleSize: extractedSpec.studyDesign.targetEnrollment,
          stratificationFactors: extractedSpec.randomization.stratificationFactors,
        },
      },
      treatmentArms: extractedSpec.treatmentArms,
      visitSchedule: extractedSpec.visitSchedule,
      supplyConfig: {
        product: extractedSpec.supplyRequirements,
        bufferLevel: 0.2, // 20% buffer
        resupplyThreshold: 0.3, // Resupply at 30%
      },
    };

    return config;
  }

  /**
   * Validate parsed specification
   */
  validateParsedSpec(extractedSpec: ExtractedSpec): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!extractedSpec.studyDesign.phase) {
      errors.push('Study phase not identified');
    }

    if (!extractedSpec.studyDesign.blindingType) {
      errors.push('Blinding type not identified');
    }

    if (extractedSpec.treatmentArms.length === 0) {
      errors.push('No treatment arms identified');
    }

    if (!extractedSpec.randomization.algorithm) {
      errors.push('Randomization algorithm not identified');
    }

    if (extractedSpec.studyDesign.targetEnrollment <= 0) {
      errors.push('Invalid target enrollment');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

export default new NLPService();

/**
 * Risk-Based Monitoring (RBM) Service
 *
 * Automated risk detection and quality monitoring
 * Vendor parity: Veeva, Oracle (Risk-based study management)
 */

import { prisma } from '../database/connection';
import { logger } from '../utils/logger';

interface RiskIndicator {
  id: string;
  category: 'DATA_QUALITY' | 'SAFETY' | 'ENROLLMENT' | 'PROTOCOL' | 'SITE_PERFORMANCE';
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  description: string;
  threshold: number;
  currentValue: number;
  status: 'NORMAL' | 'WARNING' | 'CRITICAL';
}

interface SiteRiskProfile {
  siteId: string;
  siteName: string;
  overallRiskScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  indicators: RiskIndicator[];
  lastAssessment: Date;
  recommendations: string[];
}

interface MonitoringPlan {
  studyId: string;
  approach: 'RISK_BASED' | 'TRADITIONAL' | 'HYBRID';
  criticalDataPoints: string[];
  onSiteVisitFrequency: 'MONTHLY' | 'QUARTERLY' | 'AS_NEEDED';
  remoteMonitoringFrequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
  keyRiskIndicators: RiskIndicator[];
}

class RiskBasedMonitoringService {
  /**
   * Assess site risk profile
   */
  async assessSiteRisk(siteId: string, studyId: string): Promise<SiteRiskProfile> {
    logger.info(`Assessing risk profile for site ${siteId}`);

    const site = await prisma.site.findUnique({
      where: { id: siteId },
    });

    if (!site) {
      throw new Error('Site not found');
    }

    // Get patients at site
    const patients = await prisma.patient.findMany({
      where: { siteId, studyId },
    });

    // Calculate risk indicators
    const indicators: RiskIndicator[] = [];

    // 1. Enrollment Risk
    const enrollmentRisk = await this.assessEnrollmentRisk(siteId, studyId, patients.length);
    indicators.push(enrollmentRisk);

    // 2. Data Quality Risk
    const dataQualityRisk = await this.assessDataQualityRisk(siteId, studyId);
    indicators.push(dataQualityRisk);

    // 3. Protocol Deviation Risk
    const protocolRisk = await this.assessProtocolDeviationRisk(siteId, studyId);
    indicators.push(protocolRisk);

    // 4. Safety Reporting Risk
    const safetyRisk = await this.assessSafetyReportingRisk(siteId, studyId);
    indicators.push(safetyRisk);

    // 5. Site Performance Risk
    const performanceRisk = await this.assessSitePerformanceRisk(siteId, studyId);
    indicators.push(performanceRisk);

    // Calculate overall risk score
    const overallRiskScore = this.calculateOverallRiskScore(indicators);
    const riskLevel = this.determineRiskLevel(overallRiskScore);

    // Generate recommendations
    const recommendations = this.generateRecommendations(indicators);

    const riskProfile: SiteRiskProfile = {
      siteId,
      siteName: site.name,
      overallRiskScore,
      riskLevel,
      indicators,
      lastAssessment: new Date(),
      recommendations,
    };

    // Store assessment
    logger.info(`Site ${siteId} risk level: ${riskLevel} (score: ${overallRiskScore})`);

    // Trigger alerts if critical
    if (riskLevel === 'CRITICAL' || riskLevel === 'HIGH') {
      await this.triggerRiskAlert(riskProfile);
    }

    return riskProfile;
  }

  /**
   * Assess enrollment risk
   */
  private async assessEnrollmentRisk(
    siteId: string,
    studyId: string,
    currentEnrollment: number
  ): Promise<RiskIndicator> {
    const studySite = await prisma.studySite.findFirst({
      where: { siteId, studyId },
    });

    const targetEnrollment = studySite?.targetEnrollment || 100;
    const enrollmentRate = (currentEnrollment / targetEnrollment) * 100;

    let status: 'NORMAL' | 'WARNING' | 'CRITICAL' = 'NORMAL';
    let severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';

    if (enrollmentRate < 30) {
      status = 'CRITICAL';
      severity = 'CRITICAL';
    } else if (enrollmentRate < 60) {
      status = 'WARNING';
      severity = 'MEDIUM';
    }

    return {
      id: 'ENROLLMENT_RISK',
      category: 'ENROLLMENT',
      severity,
      description: 'Site enrollment below target',
      threshold: 60,
      currentValue: enrollmentRate,
      status,
    };
  }

  /**
   * Assess data quality risk
   */
  private async assessDataQualityRisk(siteId: string, studyId: string): Promise<RiskIndicator> {
    // Simulate data quality metrics
    // In production, query actual data quality metrics

    const patients = await prisma.patient.findMany({
      where: { siteId, studyId },
    });

    // Calculate missing data percentage
    let missingDataCount = 0;
    patients.forEach(patient => {
      if (!patient.dateOfBirth) missingDataCount++;
      if (!patient.gender) missingDataCount++;
      if (!patient.initials) missingDataCount++;
    });

    const totalDataPoints = patients.length * 3; // 3 required fields per patient
    const missingDataRate = (missingDataCount / totalDataPoints) * 100;

    let status: 'NORMAL' | 'WARNING' | 'CRITICAL' = 'NORMAL';
    let severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';

    if (missingDataRate > 20) {
      status = 'CRITICAL';
      severity = 'CRITICAL';
    } else if (missingDataRate > 10) {
      status = 'WARNING';
      severity = 'MEDIUM';
    }

    return {
      id: 'DATA_QUALITY_RISK',
      category: 'DATA_QUALITY',
      severity,
      description: 'Missing or incomplete data',
      threshold: 10,
      currentValue: missingDataRate,
      status,
    };
  }

  /**
   * Assess protocol deviation risk
   */
  private async assessProtocolDeviationRisk(
    siteId: string,
    studyId: string
  ): Promise<RiskIndicator> {
    // In production, query protocol deviation records
    const deviationCount = 0; // Placeholder

    let status: 'NORMAL' | 'WARNING' | 'CRITICAL' = 'NORMAL';
    let severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';

    if (deviationCount > 10) {
      status = 'CRITICAL';
      severity = 'HIGH';
    } else if (deviationCount > 5) {
      status = 'WARNING';
      severity = 'MEDIUM';
    }

    return {
      id: 'PROTOCOL_DEVIATION_RISK',
      category: 'PROTOCOL',
      severity,
      description: 'Protocol deviations detected',
      threshold: 5,
      currentValue: deviationCount,
      status,
    };
  }

  /**
   * Assess safety reporting risk
   */
  private async assessSafetyReportingRisk(
    siteId: string,
    studyId: string
  ): Promise<RiskIndicator> {
    // In production, check SAE reporting timeliness
    const lateReports = 0; // Placeholder

    let status: 'NORMAL' | 'WARNING' | 'CRITICAL' = 'NORMAL';
    let severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';

    if (lateReports > 2) {
      status = 'CRITICAL';
      severity = 'CRITICAL';
    } else if (lateReports > 0) {
      status = 'WARNING';
      severity = 'HIGH';
    }

    return {
      id: 'SAFETY_REPORTING_RISK',
      category: 'SAFETY',
      severity,
      description: 'Late safety event reporting',
      threshold: 0,
      currentValue: lateReports,
      status,
    };
  }

  /**
   * Assess site performance risk
   */
  private async assessSitePerformanceRisk(
    siteId: string,
    studyId: string
  ): Promise<RiskIndicator> {
    const patients = await prisma.patient.findMany({
      where: { siteId, studyId },
    });

    // Calculate screen failure rate
    const screenFailures = patients.filter(p => p.status === 'SCREEN_FAILED').length;
    const screenFailureRate = (screenFailures / patients.length) * 100;

    let status: 'NORMAL' | 'WARNING' | 'CRITICAL' = 'NORMAL';
    let severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';

    if (screenFailureRate > 50) {
      status = 'CRITICAL';
      severity = 'HIGH';
    } else if (screenFailureRate > 30) {
      status = 'WARNING';
      severity = 'MEDIUM';
    }

    return {
      id: 'SITE_PERFORMANCE_RISK',
      category: 'SITE_PERFORMANCE',
      severity,
      description: 'High screen failure rate',
      threshold: 30,
      currentValue: screenFailureRate,
      status,
    };
  }

  /**
   * Calculate overall risk score
   */
  private calculateOverallRiskScore(indicators: RiskIndicator[]): number {
    const weights = {
      CRITICAL: 100,
      HIGH: 75,
      MEDIUM: 50,
      LOW: 25,
    };

    let totalScore = 0;
    indicators.forEach(indicator => {
      totalScore += weights[indicator.severity];
    });

    return totalScore / indicators.length;
  }

  /**
   * Determine risk level from score
   */
  private determineRiskLevel(score: number): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
    if (score >= 75) return 'CRITICAL';
    if (score >= 50) return 'HIGH';
    if (score >= 25) return 'MEDIUM';
    return 'LOW';
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(indicators: RiskIndicator[]): string[] {
    const recommendations: string[] = [];

    indicators.forEach(indicator => {
      if (indicator.status === 'CRITICAL' || indicator.status === 'WARNING') {
        switch (indicator.id) {
          case 'ENROLLMENT_RISK':
            recommendations.push('Increase recruitment efforts at this site');
            recommendations.push('Review inclusion/exclusion criteria with site staff');
            break;
          case 'DATA_QUALITY_RISK':
            recommendations.push('Schedule data cleaning session with site');
            recommendations.push('Provide additional training on data entry');
            break;
          case 'PROTOCOL_DEVIATION_RISK':
            recommendations.push('Conduct protocol review with site staff');
            recommendations.push('Implement additional quality controls');
            break;
          case 'SAFETY_REPORTING_RISK':
            recommendations.push('Immediate safety reporting training required');
            recommendations.push('Implement daily safety event checks');
            break;
          case 'SITE_PERFORMANCE_RISK':
            recommendations.push('Review patient screening procedures');
            recommendations.push('Consider site activation review');
            break;
        }
      }
    });

    return recommendations;
  }

  /**
   * Trigger risk alert
   */
  private async triggerRiskAlert(riskProfile: SiteRiskProfile): Promise<void> {
    logger.warn(`High/Critical risk detected at site ${riskProfile.siteId}`);

    // Create notification for study manager
    await prisma.notification.create({
      data: {
        recipientId: 'study-manager',
        type: 'SYSTEM_ALERT',
        channel: 'EMAIL',
        subject: `Risk Alert: ${riskProfile.siteName}`,
        message: `Site risk level: ${riskProfile.riskLevel}. Immediate action recommended.`,
        data: {
          siteId: riskProfile.siteId,
          riskScore: riskProfile.overallRiskScore,
          indicators: riskProfile.indicators.filter(i => i.status !== 'NORMAL'),
          recommendations: riskProfile.recommendations,
        },
        status: 'PENDING',
      },
    });
  }

  /**
   * Generate risk-based monitoring plan
   */
  async generateMonitoringPlan(studyId: string): Promise<MonitoringPlan> {
    logger.info(`Generating RBM plan for study ${studyId}`);

    const study = await prisma.study.findUnique({
      where: { id: studyId },
    });

    if (!study) {
      throw new Error('Study not found');
    }

    // Define critical data points based on study phase
    const criticalDataPoints = [
      'Informed Consent',
      'Inclusion/Exclusion Criteria',
      'Primary Endpoint',
      'Safety Events',
      'Randomization',
      'Drug Accountability',
    ];

    // Define key risk indicators
    const keyRiskIndicators: RiskIndicator[] = [
      {
        id: 'ENROLLMENT_RATE',
        category: 'ENROLLMENT',
        severity: 'HIGH',
        description: 'Enrollment rate below 50%',
        threshold: 50,
        currentValue: 0,
        status: 'NORMAL',
      },
      {
        id: 'DATA_COMPLETENESS',
        category: 'DATA_QUALITY',
        severity: 'HIGH',
        description: 'Missing data > 10%',
        threshold: 10,
        currentValue: 0,
        status: 'NORMAL',
      },
      {
        id: 'SAE_REPORTING',
        category: 'SAFETY',
        severity: 'CRITICAL',
        description: 'Late SAE reporting',
        threshold: 0,
        currentValue: 0,
        status: 'NORMAL',
      },
    ];

    const plan: MonitoringPlan = {
      studyId,
      approach: 'RISK_BASED',
      criticalDataPoints,
      onSiteVisitFrequency: 'AS_NEEDED',
      remoteMonitoringFrequency: 'WEEKLY',
      keyRiskIndicators,
    };

    return plan;
  }

  /**
   * Perform automated data quality check
   */
  async performDataQualityCheck(studyId: string): Promise<any> {
    logger.info(`Performing data quality check for study ${studyId}`);

    const patients = await prisma.patient.findMany({
      where: { studyId },
    });

    const issues = {
      missingData: 0,
      duplicates: 0,
      outliers: 0,
      inconsistencies: 0,
    };

    // Check for missing required fields
    patients.forEach(patient => {
      if (!patient.initials || !patient.dateOfBirth || !patient.gender) {
        issues.missingData++;
      }
    });

    // Check for duplicates
    const initialsMap = new Map();
    patients.forEach(patient => {
      if (initialsMap.has(patient.initials)) {
        issues.duplicates++;
      }
      initialsMap.set(patient.initials, true);
    });

    return {
      totalPatients: patients.length,
      issues,
      dataQualityScore: 100 - ((issues.missingData + issues.duplicates) / patients.length) * 100,
      recommendations: this.getDataQualityRecommendations(issues),
    };
  }

  /**
   * Get data quality recommendations
   */
  private getDataQualityRecommendations(issues: any): string[] {
    const recommendations: string[] = [];

    if (issues.missingData > 0) {
      recommendations.push('Complete missing required patient data fields');
    }
    if (issues.duplicates > 0) {
      recommendations.push('Review and resolve duplicate patient records');
    }
    if (issues.outliers > 0) {
      recommendations.push('Investigate data outliers for potential errors');
    }
    if (issues.inconsistencies > 0) {
      recommendations.push('Resolve data inconsistencies across forms');
    }

    return recommendations;
  }

  /**
   * Schedule risk assessment
   */
  async scheduleRiskAssessment(studyId: string, frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY'): Promise<void> {
    logger.info(`Scheduling ${frequency} risk assessment for study ${studyId}`);

    // In production, integrate with job scheduler (Bull, cron, etc.)
    // This would create recurring jobs to run risk assessments
  }
}

export default new RiskBasedMonitoringService();

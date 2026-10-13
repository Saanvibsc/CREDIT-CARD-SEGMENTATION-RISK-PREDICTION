import { jsPDF } from 'jspdf';

export function generateRiskReportPDF(customer, assessment) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;
  let y = 16;

  // Header Banner: Deep Navy (#14213D)
  doc.setFillColor(20, 33, 61);
  doc.rect(margin, y, contentWidth, 24, 'F');

  // Brand and Title
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text('CREDITGUARD AI | ENTERPRISE RISK INTELLIGENCE', margin + 6, y + 9);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(200, 215, 235);
  doc.text('INTERNAL BANK CREDIT RISK ASSESSMENT MEMORANDUM — STRICTLY CONFIDENTIAL', margin + 6, y + 17);

  // Reference Metadata Box on right side of banner
  doc.setFontSize(7.5);
  doc.setTextColor(255, 255, 255);
  doc.text(`REF: CG-AUDIT-${customer.id}`, pageWidth - margin - 50, y + 9);
  doc.text(`DATE: ${assessment.assessedAt}`, pageWidth - margin - 50, y + 15);

  y += 30;

  // Section 1: Customer Profile Overview
  doc.setTextColor(20, 33, 61);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('1. CUSTOMER INFORMATION & CREDIT CARD ACCOUNT', margin, y);
  y += 2;

  doc.setDrawColor(215, 222, 235);
  doc.setLineWidth(0.4);
  doc.line(margin, y, margin + contentWidth, y);
  y += 6;

  // Two Column Customer Details Table
  doc.setFillColor(248, 250, 252);
  doc.rect(margin, y, contentWidth, 28, 'F');
  doc.rect(margin, y, contentWidth, 28, 'S');

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'bold');

  const col1 = margin + 4;
  const col2 = margin + 48;
  const col3 = margin + 92;
  const col4 = margin + 136;

  // Row 1
  doc.text('Customer ID:', col1, y + 6);
  doc.setTextColor(15, 23, 42);
  doc.text(customer.id, col2, y + 6);

  doc.setTextColor(100, 116, 139);
  doc.text('Annual Income:', col3, y + 6);
  doc.setTextColor(15, 23, 42);
  doc.text(`$${Number(customer.annualIncome || 0).toLocaleString('en-US')}`, col4, y + 6);

  // Row 2
  doc.setTextColor(100, 116, 139);
  doc.text('Customer Name:', col1, y + 13);
  doc.setTextColor(15, 23, 42);
  doc.text(customer.fullName || 'Cardholder', col2, y + 13);

  doc.setTextColor(100, 116, 139);
  doc.text('Card Product Type:', col3, y + 13);
  doc.setTextColor(15, 23, 42);
  doc.text(customer.cardType || 'Standard', col4, y + 13);

  // Row 3
  doc.setTextColor(100, 116, 139);
  doc.text('Credit Card Limit:', col1, y + 20);
  doc.setTextColor(15, 23, 42);
  doc.text(`$${Number(customer.creditLimit || 0).toLocaleString('en-US')}`, col2, y + 20);

  doc.setTextColor(100, 116, 139);
  doc.text('Current Balance:', col3, y + 20);
  doc.setTextColor(15, 23, 42);
  doc.text(`$${Number(customer.outstandingBalance || 0).toLocaleString('en-US')}`, col4, y + 20);

  // Row 4
  doc.setTextColor(100, 116, 139);
  doc.text('Card Limit Used (%):', col1, y + 26);
  doc.setTextColor(15, 23, 42);
  doc.text(`${Number(customer.creditUtilization || 0).toFixed(1)}%`, col2, y + 26);

  doc.setTextColor(100, 116, 139);
  doc.text('Customer Group:', col3, y + 26);
  doc.setTextColor(15, 23, 42);
  doc.text(customer.segment, col4, y + 26);

  y += 34;

  // Section 2: Predictive Risk Score & Default Assessment
  doc.setTextColor(20, 33, 61);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('2. RISK SCORE & CHANCE OF DEFAULT', margin, y);
  y += 2;
  doc.line(margin, y, margin + contentWidth, y);
  y += 6;

  // 3 Metric Summary Blocks
  const boxWidth = (contentWidth - 6) / 3;

  // Box 1: Composite Risk Score
  doc.setFillColor(245, 247, 251);
  doc.rect(margin, y, boxWidth, 22, 'F');
  doc.rect(margin, y, boxWidth, 22, 'S');

  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('RISK INDEX (0 - 100)', margin + 4, y + 6);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  
  if (assessment.riskTier === 'Low') {
    doc.setTextColor(21, 154, 140);
  } else if (assessment.riskTier === 'Medium') {
    doc.setTextColor(217, 119, 6);
  } else {
    doc.setTextColor(220, 38, 38);
  }
  doc.text(`${assessment.riskScore} / 100`, margin + 4, y + 16);

  // Box 2: Predicted Probability of Default
  const box2X = margin + boxWidth + 3;
  doc.setFillColor(245, 247, 251);
  doc.rect(box2X, y, boxWidth, 22, 'F');
  doc.rect(box2X, y, boxWidth, 22, 'S');

  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('PROBABILITY OF DEFAULT (PD %)', box2X + 4, y + 6);
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(20, 33, 61);
  doc.text(`${Number(assessment.defaultProbability).toFixed(1)}%`, box2X + 4, y + 16);

  // Box 3: Risk Classification Tier
  const box3X = margin + (boxWidth * 2) + 6;
  doc.setFillColor(245, 247, 251);
  doc.rect(box3X, y, boxWidth, 22, 'F');
  doc.rect(box3X, y, boxWidth, 22, 'S');

  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('CLASSIFICATION TIER', box3X + 4, y + 6);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  if (assessment.riskTier === 'Low') {
    doc.setTextColor(21, 154, 140);
    doc.text('LOW RISK (PRIME)', box3X + 4, y + 16);
  } else if (assessment.riskTier === 'Medium') {
    doc.setTextColor(217, 119, 6);
    doc.text('MEDIUM RISK (WATCH)', box3X + 4, y + 16);
  } else {
    doc.setTextColor(220, 38, 38);
    doc.text('HIGH RISK (CRITICAL)', box3X + 4, y + 16);
  }

  y += 28;

  // Section 3: Risk Factor Contributions
  doc.setTextColor(20, 33, 61);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('3. KEY FACTORS INFLUENCING THIS RISK SCORE', margin, y);
  y += 2;
  doc.line(margin, y, margin + contentWidth, y);
  y += 6;

  // Factors mini table
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setFillColor(241, 245, 249);
  doc.rect(margin, y, contentWidth, 6, 'F');
  doc.setTextColor(71, 85, 105);
  doc.text('CATEGORY', margin + 3, y + 4.5);
  doc.text('FACTOR NAME', margin + 35, y + 4.5);
  doc.text('IMPACT ON RISK', margin + 85, y + 4.5);
  doc.text('FINDING & DETAILS', margin + 115, y + 4.5);
  y += 7;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);

  (assessment.factorContributions || []).slice(0, 5).forEach((item) => {
    doc.setTextColor(100, 116, 139);
    doc.text(item.category || '', margin + 3, y + 4);
    doc.setTextColor(30, 41, 59);
    doc.text(item.factor || '', margin + 35, y + 4);
    
    if (item.impact === 'positive') {
      doc.setTextColor(21, 154, 140);
      doc.text('Lowers Risk (-)', margin + 85, y + 4);
    } else if (item.impact === 'negative') {
      doc.setTextColor(220, 38, 38);
      doc.text('Raises Risk (+)', margin + 85, y + 4);
    } else {
      doc.setTextColor(100, 116, 139);
      doc.text('Neutral (~)', margin + 85, y + 4);
    }

    doc.setTextColor(51, 65, 85);
    const splitDesc = doc.splitTextToSize(item.description || '', 60);
    doc.text(splitDesc[0] || '', margin + 115, y + 4);

    doc.setDrawColor(240, 243, 248);
    doc.line(margin, y + 6.5, margin + contentWidth, y + 6.5);
    y += 7;
  });

  y += 3;

  // Section 4: Positive & Early Warning Indicators
  doc.setTextColor(20, 33, 61);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('4. POSITIVE HABITS & WARNING FLAGS', margin, y);
  y += 2;
  doc.line(margin, y, margin + contentWidth, y);
  y += 5;

  doc.setFontSize(8);
  if (assessment.negativeIndicators && assessment.negativeIndicators.length > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(185, 28, 28);
    doc.text('Warning & Risk Flags:', margin, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    assessment.negativeIndicators.forEach((ind) => {
      doc.text(`*  ${ind}`, margin + 3, y);
      y += 4;
    });
  }

  if (assessment.positiveIndicators && assessment.positiveIndicators.length > 0) {
    y += 1;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 118, 110);
    doc.text('Positive Credit Habits:', margin, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 65, 85);
    assessment.positiveIndicators.forEach((ind) => {
      doc.text(`*  ${ind}`, margin + 3, y);
      y += 4;
    });
  }

  y += 3;

  // Section 5: Recommended Action
  doc.setTextColor(20, 33, 61);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('5. RECOMMENDED NEXT STEPS', margin, y);
  y += 2;
  doc.line(margin, y, margin + contentWidth, y);
  y += 5;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 41, 59);

  (assessment.recommendedActions || []).forEach((action, idx) => {
    doc.text(`${idx + 1}. ${action}`, margin + 3, y);
    y += 4.5;
  });

  // Footer Disclaimer Banner
  const footerY = 270;
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, footerY, margin + contentWidth, footerY);

  doc.setFontSize(6.8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(100, 116, 139);
  doc.text(
    'PROTOTYPE DISCLAIMER: Default probabilities are estimates from the saved model, not certainty or a lending decision. Display bands are not official credit-bureau scores. This model package does not include a feature-attribution artifact.',
    margin,
    footerY + 4,
    { maxWidth: contentWidth }
  );

  doc.setFont('helvetica', 'normal');
  doc.text(`Generated by: CreditGuard AI prototype | Session ID: CG-AUTH-${Date.now().toString(36).toUpperCase()}`, margin, footerY + 14);
  doc.text(`Page 1 of 1`, pageWidth - margin - 18, footerY + 14);

  // Trigger browser download
  doc.save(`CreditGuard_Risk_Report_${customer.id}.pdf`);
}

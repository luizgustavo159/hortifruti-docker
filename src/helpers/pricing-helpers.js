/**
 * Helpers para cálculo de preços e margens de lucro
 * Arquivo: src/helpers/pricing-helpers.js
 */

function calculateWeightedAverageCost(currentStock, currentAvgCost, newQuantity, newUnitCost) {
  if (currentStock <= 0 || currentAvgCost <= 0) {
    return newUnitCost;
  }

  const totalCostBefore = currentStock * currentAvgCost;
  const totalCostNew = newQuantity * newUnitCost;
  const newAvgCost = (totalCostBefore + totalCostNew) / (currentStock + newQuantity);

  return Math.round(newAvgCost * 100) / 100;
}

function calculateSuggestedPrice(avgCost, profitMarginPercent) {
  if (avgCost <= 0) {
    return 0;
  }

  const suggestedPrice = avgCost * (1 + profitMarginPercent / 100);
  return Math.round(suggestedPrice * 100) / 100;
}

function calculateCurrentMarginPercent(currentPrice, avgCost) {
  if (avgCost <= 0 || currentPrice <= 0) {
    return 0;
  }

  const margin = ((currentPrice - avgCost) / currentPrice) * 100;
  return Math.round(margin * 100) / 100;
}

function calculateProfitPerUnit(currentPrice, avgCost) {
  if (avgCost <= 0) {
    return 0;
  }

  const profit = currentPrice - avgCost;
  return Math.round(profit * 100) / 100;
}

function calculateTotalProfitInStock(currentPrice, avgCost, currentStock) {
  const profitPerUnit = calculateProfitPerUnit(currentPrice, avgCost);
  return Math.round(profitPerUnit * currentStock * 100) / 100;
}

function determineMarginStatus(currentMarginPercent, targetMarginPercent, avgCost) {
  if (avgCost <= 0) {
    return 'no_cost';
  }

  if (currentMarginPercent < targetMarginPercent) {
    return 'low_margin';
  }

  return 'ok';
}

function calculateMarginDifference(currentMarginPercent, targetMarginPercent) {
  return Math.round((currentMarginPercent - targetMarginPercent) * 100) / 100;
}

module.exports = {
  calculateWeightedAverageCost,
  calculateSuggestedPrice,
  calculateCurrentMarginPercent,
  calculateProfitPerUnit,
  calculateTotalProfitInStock,
  determineMarginStatus,
  calculateMarginDifference,
};

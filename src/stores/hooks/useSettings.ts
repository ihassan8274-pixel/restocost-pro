import { useSettingsStore } from '@stores/settingsStore';

export const useSettings = () => {
  const {
    branches, unitsOfMeasure, materialBarcodes, materialCategories, customCategories,
    currencies, companies, customRoles, automationRules, scheduledReports,
    addBranch, updateBranch, deleteBranch,
    addUnitOfMeasure, updateUnitOfMeasure, deleteUnitOfMeasure,
    addMaterialBarcode, updateMaterialBarcode, deleteMaterialBarcode,
    barcodesForMaterial, findByBarcode,
    addMaterialCategory, updateMaterialCategory, deleteMaterialCategory,
    addCategory, deleteCategory,
    addCurrency, updateCurrency, deleteCurrency, getCurrencyRate,
    addCompany, updateCompany, deleteCompany, getCompanyName,
    addRole, deleteRole, setAutomationRule,
    addScheduledReport, setScheduledReport, runScheduledReport,
  } = useSettingsStore();

  return {
    branches, unitsOfMeasure, materialBarcodes, materialCategories, customCategories,
    currencies, companies, customRoles, automationRules, scheduledReports,
    addBranch, updateBranch, deleteBranch,
    addUnitOfMeasure, updateUnitOfMeasure, deleteUnitOfMeasure,
    addMaterialBarcode, updateMaterialBarcode, deleteMaterialBarcode,
    barcodesForMaterial, findByBarcode,
    addMaterialCategory, updateMaterialCategory, deleteMaterialCategory,
    addCategory, deleteCategory,
    addCurrency, updateCurrency, deleteCurrency, getCurrencyRate,
    addCompany, updateCompany, deleteCompany, getCompanyName,
    addRole, deleteRole, setAutomationRule,
    addScheduledReport, setScheduledReport, runScheduledReport,
  };
};
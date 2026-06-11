import React from 'react';
import { AadeDocumentType } from '../../types';
import { formatAadeIncomeCategoryLabel, getAllowedIncomeTypeOptions } from '../../utils/legalDocuments';

interface IncomeClassificationTypeSelectProps {
  documentType: AadeDocumentType;
  category: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  showCategoryHint?: boolean;
  selectClassName?: string;
}

export default function IncomeClassificationTypeSelect({
  documentType,
  category,
  value,
  onChange,
  className = '',
  showCategoryHint = true,
  selectClassName = '',
}: IncomeClassificationTypeSelectProps) {
  if (documentType === '9.3') {
    return (
      <span className={`text-[10px] font-medium text-slate-400 ${className}`}>
        Διακίνηση (χωρίς Ε3)
      </span>
    );
  }

  const options = getAllowedIncomeTypeOptions(documentType, category);
  const currentValue = value || '';

  return (
    <div className={className}>
      <select
        value={currentValue}
        onChange={(event) => onChange(event.target.value)}
        className={`w-full min-w-[10rem] rounded-lg border border-slate-200 px-1 py-1 text-[10px] outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-100 ${selectClassName}`}
        title="Χαρακτηρισμός εσόδου myDATA (classificationType)"
      >
        {!currentValue && <option value="">— Επιλογή χαρακτηρισμού —</option>}
        {!options.some((option) => option.value === currentValue) && currentValue && (
          <option value={currentValue}>{currentValue}</option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      {showCategoryHint && category && (
        <div
          className="mt-0.5 truncate text-[9px] font-medium text-slate-400"
          title={formatAadeIncomeCategoryLabel(category)}
        >
          {formatAadeIncomeCategoryLabel(category)}
        </div>
      )}
    </div>
  );
}

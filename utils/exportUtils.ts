
/**
 * Flattens a JSON object for CSV export.
 * Specifically handles the ERP's nested structures like Labor and Variants.
 */
export const flattenForCSV = (data: any[]): any[] => {
    return data.map(item => {
        const flattened: any = {};
        
        const traverse = (obj: any, prefix = '') => {
            for (const key in obj) {
                const value = obj[key];
                const newKey = prefix ? `${prefix}_${key}` : key;
                
                if (value && typeof value === 'object' && !Array.isArray(value)) {
                    traverse(value, newKey);
                } else if (Array.isArray(value)) {
                    // For arrays (like recipe or molds), stringify them so they fit in one cell
                    flattened[newKey] = JSON.stringify(value);
                } else {
                    flattened[newKey] = value;
                }
            }
        };
        
        traverse(item);
        return flattened;
    });
};

/**
 * Converts an array of objects to a CSV string.
 */
export const convertToCSV = (data: any[]): string => {
    if (data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvRows = [
        headers.join(','), // Header row
        ...data.map(row => 
            headers.map(fieldName => {
                const value = row[fieldName] ?? '';
                const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
                // Escape quotes and wrap in quotes to handle commas within data
                return `"${stringValue.replace(/"/g, '""')}"`;
            }).join(',')
        )
    ];
    
    return csvRows.join('\r\n');
};

/**
 * Triggers a browser download of a file.
 */
export const downloadFile = (content: string, fileName: string, contentType: string) => {
    const blob = new Blob([content], { type: contentType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
};

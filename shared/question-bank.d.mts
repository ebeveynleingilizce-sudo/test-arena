export const reportTypes:readonly string[];
export const reportStatuses:Readonly<Record<string,string>>;
export function normalizeBankRecord(input:any,tree:any):any;
export function importBankRecords(value:any,tree:any):any[];
export function bankProjection(tree:any,records:any[]):Promise<any>;

import { Client, Account, Databases } from 'appwrite';

export const client = new Client();

// Configure your Appwrite endpoint and project ID here
client
    .setEndpoint('https://cloud.appwrite.io/v1')
    .setProject('ilios-erp'); // Replace with your actual Project ID

export const account = new Account(client);
export const databases = new Databases(client);

// Helper constants for Database & Collection IDs
export const DB_ID = 'ilios_erp_db';
export const COLLECTIONS = {
    PRODUCTS: 'products',
    MATERIALS: 'materials',
    PRODUCT_MATERIALS: 'product_materials',
    SETTINGS: 'global_settings'
};
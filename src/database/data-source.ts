import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { getConfig as getDatabaseConfig } from '../config/database/database.config';

const dataSource = new DataSource(getDatabaseConfig());

export default dataSource;

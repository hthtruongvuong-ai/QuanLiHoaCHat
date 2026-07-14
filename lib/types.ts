export type UserRole = 'admin' | 'chemist' | 'technician';

export type HazardLevel = 'low' | 'medium' | 'high' | 'toxic';

export type LotStatus = 'active' | 'expired' | 'depleted';

export type MovementType = 'in' | 'out' | 'adjust';

export type SlipStatus = 'draft' | 'confirmed';

export type PrepStatus = 'draft' | 'completed';

export type PrepResult = 'success' | 'failed' | 'pending';

export interface Profile {
  id: string;
  full_name: string;
  role: UserRole;
  created_at: string;
}

export interface StorageLocation {
  id: string;
  name: string;
  building: string;
  room: string;
  description: string;
  created_at: string;
}

export interface Chemical {
  id: string;
  code: string;
  name: string;
  cas_number: string;
  formula: string;
  unit: string;
  min_stock: number;
  hazard_level: HazardLevel;
  category: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface Lot {
  id: string;
  chemical_id: string;
  lot_number: string;
  quantity: number;
  initial_quantity: number;
  unit: string;
  received_date: string | null;
  expiry_date: string | null;
  storage_location_id: string | null;
  supplier: string;
  status: LotStatus;
  opened: boolean;
  coa_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface LotWithRelations extends Lot {
  chemicals?: Pick<Chemical, 'id' | 'code' | 'name' | 'unit' | 'min_stock'>;
  storage_locations?: Pick<StorageLocation, 'id' | 'name'> | null;
}

export interface UsageSlip {
  id: string;
  slip_number: string;
  user_id: string;
  user_name: string;
  purpose: string;
  status: SlipStatus;
  created_at: string;
  updated_at?: string;
}

export interface UsageSlipItem {
  id: string;
  slip_id: string;
  lot_id: string | null;
  chemical_name: string;
  quantity_used: number;
  unit: string;
  created_at: string;
}

export interface UsageSlipWithItems extends UsageSlip {
  usage_slip_items?: UsageSlipItem[];
}

export interface StockMovement {
  id: string;
  movement_type: MovementType;
  lot_id: string | null;
  chemical_id: string | null;
  quantity: number;
  unit: string;
  reference: string;
  user_id: string;
  user_name: string;
  notes: string;
  created_at: string;
}

export interface StockMovementWithRelations extends StockMovement {
  chemicals?: Pick<Chemical, 'id' | 'code' | 'name'> | null;
  lots?: Pick<Lot, 'id' | 'lot_number'> | null;
}

export interface Preparation {
  id: string;
  prep_number: string;
  product_name: string;
  product_code: string;
  target_concentration: string;
  target_volume: number;
  unit: string;
  procedure: string;
  result: PrepResult;
  notes: string;
  user_id: string;
  user_name: string;
  status: PrepStatus;
  usage_slip_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PreparationItem {
  id: string;
  preparation_id: string;
  lot_id: string | null;
  chemical_id: string | null;
  chemical_name: string;
  quantity_used: number;
  unit: string;
  created_at: string;
}

export interface PreparationWithItems extends Preparation {
  preparation_items?: PreparationItem[];
}

export type PreparedSolutionStatus =
  | 'in_use'
  | 'low_stock'
  | 'depleted'
  | 'near_expiry'
  | 'expired';

export interface PreparedSolution {
  id: string;
  preparation_id: string | null;
  batch_code: string;
  solution_name: string;
  concentration: string;
  initial_volume: number;
  used_volume: number;
  remaining_volume: number;
  unit: string;
  prepared_date: string;
  shelf_life_days: number;
  expiry_date: string | null;
  usage_role: string;
  prepared_by: string;
  status: PreparedSolutionStatus;
  created_at: string;
  updated_at: string;
}

export interface ChemicalSafetyDoc {
  id: string;
  chemical_id: string;
  doc_type: string;
  doc_name: string;
  doc_url: string;
  doc_expiry: string | null;
  uploaded_by: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface ChemicalSafetyInfo {
  id: string;
  chemical_id: string;
  ghs_classification: string;
  ghs_symbols: string;
  storage_conditions: string;
  ppe: string;
  spill_handling: string;
  first_aid: string;
  updated_at: string;
}

export interface PreparedSolutionUsage {
  id: string;
  prepared_solution_id: string;
  usage_slip_id: string | null;
  slip_number: string;
  user_id: string | null;
  user_name: string;
  quantity_used: number;
  unit: string;
  used_at: string;
  created_at: string;
}

export type NetworkTypeRef = {
  id: string;
  slug: string;
  name: string;
};

export type NetworkLocationRef = {
  id: string;
  slug: string;
  name: string;
};

export type NetworkDeviceDetail = {
  id: string;
  name: string;
  notes?: string;
  retired_at?: string;
  type: NetworkTypeRef;
  location: NetworkLocationRef;
};

export type ListNetworkDevicesInput = {
  location?: string;
  type?: string;
  include_retired?: boolean;
};

export type AddNetworkDeviceInput = {
  name: string;
  type: string;
  location: string;
  notes?: string;
};

export type UpdateNetworkDeviceInput = {
  id: string;
  name?: string;
  type?: string;
  location?: string;
  notes?: string;
};

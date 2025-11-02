import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

if (!accountSid || !authToken) {
  throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be configured");
}

const client = twilio(accountSid, authToken);
const SYNC_SERVICE_SID = process.env.TWILIO_SYNC_SERVICE_SID;

// Helper to get or create Sync Service
async function getSyncService() {
  if (SYNC_SERVICE_SID) {
    return client.sync.v1.services(SYNC_SERVICE_SID);
  }
  
  // Create a default Sync Service if one doesn't exist
  // First, try to find an existing one
  const services = await client.sync.v1.services.list({ limit: 1 });
  if (services.length > 0) {
    return client.sync.v1.services(services[0].sid);
  }
  
  // Create a new one
  const service = await client.sync.v1.services.create({ friendlyName: "AIVR Storage" });
  return client.sync.v1.services(service.sid);
}

// Helper to get or create Sync Map and return service and map SID
async function getSyncMapSid(): Promise<{ service: any; mapSid: string }> {
  const service = await getSyncService();
  const mapUniqueName = "aivr_storage";
  
  try {
    // Try to get existing map by uniqueName
    const map = await service.syncMaps(mapUniqueName).fetch();
    return { service, mapSid: map.sid };
  } catch (error: any) {
    // Map doesn't exist, create it
    if (error.code === 20404) {
      const map = await service.syncMaps.create({ uniqueName: mapUniqueName });
      return { service, mapSid: map.sid };
    }
    throw error;
  }
}

// Helper function to delete a key (used internally)
async function delKey(key: string): Promise<void> {
  try {
    const { service, mapSid } = await getSyncMapSid();
    await service.syncMaps(mapSid).syncMapItems(key).remove();
  } catch (error: any) {
    // Ignore 20404 (not found) errors - item already deleted or doesn't exist
    if (error.code !== 20404) {
      throw error;
    }
  }
}

// Redis-like interface using Twilio Sync
const sync = {
  async get(key: string): Promise<string | null> {
    try {
      const { service, mapSid } = await getSyncMapSid();
      const mapItem = await service.syncMaps(mapSid).syncMapItems(key).fetch();
      const data = mapItem.data as any;
      
      // Check if expired (TTL handling)
      if (data._expires && data._expires < Date.now()) {
        await delKey(key);
        return null;
      }
      
      return data._value ?? null;
    } catch (error: any) {
      if (error.code === 20404) {
        // Item not found
        return null;
      }
      throw error;
    }
  },

  async set(key: string, value: string, options?: { ex?: number }): Promise<void> {
    const { service, mapSid } = await getSyncMapSid();
    const data: any = { _value: value };
    
    // Add expiration if provided (ex is in seconds, convert to milliseconds)
    if (options?.ex) {
      data._expires = Date.now() + options.ex * 1000;
    }
    
    try {
      // Try to update existing item
      await service.syncMaps(mapSid).syncMapItems(key).update({ data });
    } catch (error: any) {
      if (error.code === 20404) {
        // Item doesn't exist, create it
        await service.syncMaps(mapSid).syncMapItems.create({ key, data });
      } else {
        throw error;
      }
    }
  },

  async del(key: string): Promise<void> {
    return delKey(key);
  },
};

export default sync;


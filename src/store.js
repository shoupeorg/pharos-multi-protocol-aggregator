export async function persistRun(db,run,requestKey){
  await db.prepare("INSERT INTO runs(id,request_key,captured_at,intent,status,engine_version,payload) VALUES(?,?,?,?,?,?,?) ON CONFLICT(request_key) DO NOTHING").bind(run.id,requestKey,run.capturedAt,run.interpreted?.intent||"unknown",run.routing?.status||run.interpreted?.status||"UNKNOWN",run.engineVersion,JSON.stringify(run)).run();
  const row=await db.prepare("SELECT payload FROM runs WHERE request_key=?").bind(requestKey).first(); if(!row)throw new Error("Run persistence failed.");return JSON.parse(row.payload);
}

// Configurazione del ponte: arriva dal file .env passato con --env-file.

export interface ConfigPonte {
  supabaseUrl: string
  serviceKey: string
  orgId: string
  mysql: { host: string; port: number; user: string; password: string; database: string }
  logDir: string
}

export function leggiConfig(): ConfigPonte {
  const mancanti: string[] = []
  const v = (k: string): string => {
    const x = process.env[k]
    if (!x) mancanti.push(k)
    return x ?? ''
  }
  const cfg: ConfigPonte = {
    supabaseUrl: v('SUPABASE_URL'),
    serviceKey: v('SUPABASE_SERVICE_ROLE_KEY'),
    orgId: v('ORGANIZATION_ID'),
    mysql: {
      host: v('FP_MYSQL_HOST'),
      port: Number(v('FP_MYSQL_PORT')),
      user: v('FP_MYSQL_USER'),
      password: v('FP_MYSQL_PASSWORD'),
      database: v('FP_MYSQL_DATABASE'),
    },
    logDir: v('PONTE_LOG_DIR'),
  }
  if (mancanti.length > 0) throw new Error(`Mancano nel file .env del ponte: ${mancanti.join(', ')}`)
  return cfg
}

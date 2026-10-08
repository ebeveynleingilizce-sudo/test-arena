/** Static arena geometry; decorative only, never a representation of XP or rank. */
export function ArenaScene() {
  return <svg className="arena-scene" viewBox="0 0 600 300" fill="none" aria-hidden="true">
    <ellipse cx="365" cy="246" rx="209" ry="38" stroke="currentColor" opacity=".18"/>
    <ellipse cx="365" cy="246" rx="158" ry="27" stroke="currentColor" opacity=".12"/>
    <path d="M24 250 140 215 253 181 372 128 515 46M47 275 163 240 276 206 395 153 538 71" stroke="currentColor" opacity=".22"/>
    <path d="M172 224 247 202 316 223 242 248ZM172 224 242 248 242 286 172 262ZM242 248 316 223 316 261 242 286Z" fill="#304253" stroke="#b58b51" strokeWidth="1.2"/>
    <path d="M266 178 341 155 410 177 335 202ZM266 178 335 202 335 274 266 250ZM335 202 410 177 410 249 335 274Z" fill="#283e52" stroke="#d5a359" strokeWidth="1.2"/>
    <path d="M360 122 435 99 504 121 429 146ZM360 122 429 146 429 255 360 231ZM429 146 504 121 504 230 429 255Z" fill="#354c60" stroke="#f1bb65" strokeWidth="1.4"/>
    <path d="m435 35 9 30 32-2-25 20 8 30-26-17-27 20 9-32-23-17 32-2Z" fill="#ffac35"/>
    <path d="m435 35-2 61 43-33-32 2Z" fill="#ffd18a"/>
    <path d="m433 96 26 17-8-30 25-20Z" fill="#e78b20"/>
    <path d="M435 11v10m56 28-9 4m-82-20-8-6" stroke="currentColor" opacity=".45"/>
  </svg>;
}

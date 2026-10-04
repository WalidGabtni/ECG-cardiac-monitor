import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('Function started')
    console.log('API key exists:', !!RESEND_API_KEY)

    const body = await req.json()
    console.log('Body received:', JSON.stringify(body))

    const { doctorEmail, patientName, anomalyType, confidence, eta } = body

    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not set')
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'ECG Monitor <onboarding@resend.dev>',
        to: doctorEmail,
        subject: `🚨 ${anomalyType} detected — ${patientName}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: #0f172a; padding: 24px; border-radius: 12px 12px 0 0;">
              <h1 style="color: #10b981; margin: 0; font-size: 20px;">ECG Monitor Alert</h1>
            </div>
            <div style="background: #1e293b; padding: 24px; border-radius: 0 0 12px 12px;">
              <div style="background: #450a0a; border: 1px solid #7f1d1d; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
                <h2 style="color: #f87171; margin: 0 0 8px 0; font-size: 16px;">⚠️ ${anomalyType} detected</h2>
                <p style="color: #fca5a5; margin: 0; font-size: 14px;">Confidence: ${confidence}%</p>
              </div>
              <table style="width: 100%; border-collapse: collapse;">
                <tr style="border-bottom: 1px solid #334155;">
                  <td style="color: #94a3b8; padding: 10px 0; font-size: 14px;">Patient</td>
                  <td style="color: #f1f5f9; padding: 10px 0; font-size: 14px; font-weight: 500;">${patientName}</td>
                </tr>
                <tr style="border-bottom: 1px solid #334155;">
                  <td style="color: #94a3b8; padding: 10px 0; font-size: 14px;">Anomaly</td>
                  <td style="color: #f1f5f9; padding: 10px 0; font-size: 14px; font-weight: 500;">${anomalyType}</td>
                </tr>
                <tr style="border-bottom: 1px solid #334155;">
                  <td style="color: #94a3b8; padding: 10px 0; font-size: 14px;">Confidence</td>
                  <td style="color: #f1f5f9; padding: 10px 0; font-size: 14px; font-weight: 500;">${confidence}%</td>
                </tr>
                <tr>
                  <td style="color: #94a3b8; padding: 10px 0; font-size: 14px;">ETA to hospital</td>
                  <td style="color: #f1f5f9; padding: 10px 0; font-size: 14px; font-weight: 500;">${eta}</td>
                </tr>
              </table>
              <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #334155;">
                <p style="color: #64748b; font-size: 12px; margin: 0;">
                  This is an automated alert from the ECG remote monitoring system.
                </p>
              </div>
            </div>
          </div>
        `,
      }),
    })

    const data = await res.json()
    console.log('Resend response:', JSON.stringify(data))

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    })
  } catch (error) {
    console.log('Error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
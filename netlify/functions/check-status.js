// netlify/functions/check-status.js

const { createClient } = require('@supabase/supabase-js');

const allowedOrigins = [
    'http://localhost:8888',
    'https://google-maps-backend-master.netlify.app',
    'https://mediamingle.cn'
];

exports.handler = async (event) => {
    const origin = event.headers.origin;
    const headers = {
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
    };
     if (allowedOrigins.includes(origin)) {
        headers['Access-Control-Allow-Origin'] = origin;
    }
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers, body: '' };
    }
    if (event.httpMethod !== 'GET') {
        return { statusCode: 405, headers, body: 'Method Not Allowed' };
    }

    try {
        const outTradeNo = event.queryStringParameters.outTradeNo;
        if (!outTradeNo) {
            return { statusCode: 400, headers, body: JSON.stringify({ message: 'Missing outTradeNo parameter' }) };
        }

        // const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
        const supabase = createClient(
            "https://hyxryxarutbesoqxcprk.supabase.co",
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh5eHJ5eGFydXRiZXNvcXhjcHJrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ3MjQ5MjUsImV4cCI6MjA3MDMwMDkyNX0.kK3TmssDX7WhCuslv4MOYOR9ntXgtJLWbE5ArRMRzaQ"
        );

        const { data, error } = await supabase
            .from('orders')
            .select('status')
            .eq('out_trade_no', outTradeNo)
            .single();

        if (error || !data) {
            return { statusCode: 404, headers, body: JSON.stringify({ status: 'not_found' }) };
        }

        return {
            statusCode: 200,
            headers: headers,
            body: JSON.stringify({ status: data.status })
        };

    } catch (error) {
        console.error('Error checking status:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ message: 'Internal Server Error' }) };
    }
};
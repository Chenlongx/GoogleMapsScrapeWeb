const { createClient } = require('@supabase/supabase-js');

// Check environment variables
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Error: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
    console.log('Usage:');
    console.log('  $env:SUPABASE_URL="..."; $env:SUPABASE_SERVICE_ROLE_KEY="..."; node scripts/update_supabase_prices.js');
    process.exit(1);
}

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function updatePrices() {
    console.log('🔄 Starting pricing update...');

    const plans = [
        {
            plan_code: 'premium_monthly',
            plan_name: '月付会员',
            price: 29.00,
            duration_days: 30,
            description: '30天无限次搜索'
        },
        {
            plan_code: 'premium_quarterly',
            plan_name: '季付会员',
            price: 88.00,
            duration_days: 90,
            description: '90天无限次搜索'
        },
        {
            plan_code: 'premium_yearly',
            plan_name: '年付会员',
            price: 299.00,
            duration_days: 365,
            description: '365天无限次搜索'
        }
    ];

    for (const plan of plans) {
        console.log(`📦 Updating plan: ${plan.plan_code} -> ¥${plan.price}`);

        // Check if plan exists
        const { data: existingPlan, error: fetchError } = await supabase
            .from('subscription_plans')
            .select('id')
            .eq('plan_code', plan.plan_code)
            .single();

        if (fetchError && fetchError.code !== 'PGRST116') { // PGRST116 is "Row not found"
            console.error(`❌ Error checking plan ${plan.plan_code}:`, fetchError);
            continue;
        }

        if (existingPlan) {
            // Update existing plan
            const { error } = await supabase
                .from('subscription_plans')
                .update({
                    price: plan.price,
                    plan_name: plan.plan_name,
                    duration_days: plan.duration_days,
                    description: plan.description
                })
                .eq('plan_code', plan.plan_code);

            if (error) {
                console.error(`❌ Failed to update ${plan.plan_code}:`, error);
            } else {
                console.log(`✅ Successfully updated ${plan.plan_code}`);
            }
        } else {
            // Insert new plan (Monthly might be new)
            const { error } = await supabase
                .from('subscription_plans')
                .insert(plan);

            if (error) {
                console.error(`❌ Failed to insert ${plan.plan_code}:`, error);
            } else {
                console.log(`✅ Successfully inserted new plan ${plan.plan_code}`);
            }
        }
    }

    console.log('🎉 Pricing update completed!');
}

updatePrices().catch(err => {
    console.error('❌ Unexpected error:', err);
    process.exit(1);
});

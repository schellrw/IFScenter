import os
import stripe
from flask import Blueprint, request, jsonify, current_app, redirect
# from flask_jwt_extended import jwt_required, get_jwt_identity # Remove this
from ..utils import auth_adapter # Import the module instead

# Assuming you have a User model
from ..models import User, db 

billing_bp = Blueprint("billing", __name__)

@billing_bp.route("/create-checkout-session", methods=["POST"])
def create_checkout_session():
    """Creates a Stripe Checkout session for subscription.
    
    Expects JSON body with: {"priceId": "price_xxxxxxxx"}
    Returns: {"sessionId": "cs_xxxxxxxx"} or {"url": "https://checkout.stripe.com/..."}
    """
    
    # === Verify token using Supabase ===
    user_info = auth_adapter.verify_token()
    if not user_info:
        return jsonify({"error": "Authentication required"}), 401
        
    user_id = user_info.get('sub') # Standard JWT claim for subject (user ID)
    # You might also get email or other claims depending on what Supabase/adapter returns
    # user_email = user_info.get('email') 
    
    if not user_id:
        current_app.logger.error(f"Could not extract user ID ('sub') from verified token info: {user_info}")
        return jsonify({"error": "Invalid token claims"}), 401
        
    # Fetch user from DB using the verified ID
    user = db.session.query(User).filter_by(id=user_id).first()
    
    # === Original function logic starts here ===
    data = request.get_json()
    price_id = data.get("priceId")
    current_app.logger.info(f"Received request to create checkout session for user {user_id} with price_id: {price_id}")
    
    if not price_id:
        return jsonify({"error": "Price ID is required"}), 400
        
    # user_id = get_jwt_identity() # Remove old way of getting user ID
    # user = db.session.get(User, user_id) # Remove old way of getting user
    
    if not user:
        # This case might indicate a mismatch between Supabase user ID and DB user ID
        current_app.logger.error(f"User with Supabase ID {user_id} not found in local database.")
        return jsonify({"error": "User not found in application database"}), 404
    
    current_app.logger.info(f"Found user {user.id}, Stripe Customer ID: {user.stripe_customer_id}")
    
    # TODO: Check if user already has an active subscription?
    # Depending on your logic, you might prevent creating a new session
    # if they are already subscribed.

    # Get base URL for success/cancel URLs
    # Use environment variable for frontend URL, fallback to localhost
    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
    success_url = f"{frontend_url}/payment/success?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{frontend_url}/payment/cancel"

    # ---> ADD THIS LOG <---
    current_app.logger.info(f"Attempting Stripe call prep for user {user_id} with price {price_id}")

    try:
        # See https://stripe.com/docs/api/checkout/sessions/create
        
        # Does the user already have a Stripe Customer ID?
        customer_id = user.stripe_customer_id
        
        checkout_payload = {
            "payment_method_types": ["card"],
            "line_items": [
                {
                    "price": price_id,
                    "quantity": 1,
                },
            ],
            "mode": "subscription",
            "success_url": success_url,
            "cancel_url": cancel_url,
            # Pass Supabase user ID to metadata to link during webhook
            "metadata": {
                "user_id": str(user.id) 
            }
        }
        
        # If user has a customer ID, use it
        if customer_id:
            checkout_payload["customer"] = customer_id
        else:
            # If no customer ID, pass email to create one, and link it later via webhook
            checkout_payload["customer_email"] = user.email
            # Link customer on successful subscription (optional here, better in webhook)
            checkout_payload["subscription_data"] = {
                "metadata": {
                    "user_id": str(user.id)
                }
            }
            
        # --> Log the payload being sent to Stripe
        current_app.logger.debug(f"Stripe Checkout Payload: {checkout_payload}")
            
        current_app.logger.info(f"Creating Stripe Checkout session for user {user.id} with price {price_id}")
        checkout_session = stripe.checkout.Session.create(**checkout_payload)
        
        # ---> ADD LOGGING HERE <--- 
        current_app.logger.info(f"Stripe Checkout session CREATED successfully: {checkout_session.id}") 

        current_app.logger.info(f"Stripe Checkout session created: {checkout_session.id}") # This log might be redundant now
        return jsonify({"url": checkout_session.url}), 200
        
    except stripe.error.StripeError as e:
        # --> Log detailed Stripe error
        current_app.logger.error(f"Stripe API error details: Type={type(e)}, Status={e.http_status}, Code={e.code}")
        current_app.logger.error(f"Stripe Error Str: {str(e)}")
        # Log the json_body if available, it often has more details
        if e.json_body:
             current_app.logger.error(f"Stripe JSON Body: {e.json_body}")
        # Log repr for potentially more info
        current_app.logger.error(f"Stripe Error Repr: {repr(e)}")
        return jsonify({"error": str(e)}), e.http_status or 500 # Use Stripe's status code if available
    except Exception as e:
        # --> Log general exception details
        current_app.logger.error(f"General error creating checkout session: Type={type(e)}, Repr={repr(e)}", exc_info=True) # Add exc_info=True for traceback
        return jsonify({"error": "Internal server error"}), 500

@billing_bp.route("/create-portal-session", methods=["POST"])
# @jwt_required()
def create_portal_session():
    """Creates a Stripe Billing Portal session for the user to manage their subscription."""
    # === Verify token using Supabase ===
    user_info = auth_adapter.verify_token()
    if not user_info:
        return jsonify({"error": "Authentication required"}), 401
        
    user_id = user_info.get('sub') # Standard JWT claim for subject (user ID)
    # You might also get email or other claims depending on what Supabase/adapter returns
    # user_email = user_info.get('email') 
    
    if not user_id:
        current_app.logger.error(f"Could not extract user ID ('sub') from verified token info: {user_info}")
        return jsonify({"error": "Invalid token claims"}), 401
        
    # Fetch user from DB using the verified ID
    user = db.session.query(User).filter_by(id=user_id).first()
    
    if not user:
        return jsonify({"error": "User not found"}), 404

    # Crucially, user MUST have a stripe_customer_id to access the portal
    if not user.stripe_customer_id:
        current_app.logger.warning(f"User {user_id} tried to access billing portal without stripe_customer_id.")
        # You might want to guide the user to subscribe first if they hit this
        return jsonify({"error": "No active subscription found to manage."}), 400 

    # Get base URL for return URL - should point to a page in your app, like account settings
    frontend_url = os.environ.get("FRONTEND_URL", "http://localhost:3000")
    # Example: redirect back to a /account or /settings page in your frontend app
    return_url = f"{frontend_url}/account-settings" 

    try:
        current_app.logger.info(f"Creating Stripe Portal session for customer {user.stripe_customer_id}")
        portal_session = stripe.billing_portal.Session.create(
            customer=user.stripe_customer_id,
            return_url=return_url,
        )
        current_app.logger.info(f"Stripe Portal session created: {portal_session.id}")
        return jsonify({"url": portal_session.url}), 200

    except stripe.error.StripeError as e:
        current_app.logger.error(f"Stripe API error creating portal session: {e}")
        return jsonify({"error": str(e)}), 500
    except Exception as e:
        current_app.logger.error(f"Error creating portal session: {e}")
        return jsonify({"error": "Internal server error"}), 500

@billing_bp.route("/webhook/stripe", methods=["POST"])
def stripe_webhook():
    """Handles incoming webhooks from Stripe.
    
    Verifies the signature and processes relevant events.
    """
    payload = request.data # Get raw body
    sig_header = request.headers.get('Stripe-Signature')
    webhook_secret = current_app.config.get('STRIPE_WEBHOOK_SECRET')

    if not webhook_secret:
        current_app.logger.error("Stripe webhook secret is not configured.")
        return jsonify({"error": "Webhook secret not configured"}), 500

    if not payload or not sig_header:
        current_app.logger.error("Webhook request missing payload or signature.")
        return jsonify({"error": "Invalid request"}), 400

    event = None

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, webhook_secret
        )
        current_app.logger.info(f"Received Stripe webhook event: {event['type']}")
    except ValueError as e:
        # Invalid payload
        current_app.logger.error(f"Invalid webhook payload: {e}")
        return jsonify({"error": "Invalid payload"}), 400
    except stripe.error.SignatureVerificationError as e:
        # Invalid signature
        current_app.logger.error(f"Invalid webhook signature: {e}")
        return jsonify({"error": "Invalid signature"}), 400
    except Exception as e:
        current_app.logger.error(f"Error constructing webhook event: {e}")
        return jsonify({"error": "Webhook error"}), 500

    # Handle the event
    if event['type'] == 'checkout.session.completed':
        session = event['data']['object']
        current_app.logger.info(f"Checkout session completed: {session['id']}")
        # --- TODO: Fulfillment logic --- 
        # 1. Get user_id from session metadata
        user_id = session.get('metadata', {}).get('user_id')
        if not user_id:
            current_app.logger.error("user_id not found in checkout session metadata")
            return jsonify({"error": "Missing user_id metadata"}), 400
            
        # 2. Get stripe_customer_id and stripe_subscription_id from the session
        stripe_customer_id = session.get('customer')
        stripe_subscription_id = session.get('subscription')
        
        if not stripe_customer_id or not stripe_subscription_id:
             current_app.logger.error("customer or subscription ID missing in checkout session")
             return jsonify({"error": "Missing customer/subscription ID"}), 400
             
        # 3. Retrieve the subscription details to find the Price ID / plan
        try:
            subscription = stripe.Subscription.retrieve(stripe_subscription_id)
            price_id = subscription['items']['data'][0]['price']['id']
            # --- Determine tier based on price_id ---
            # You need to map your Stripe Price IDs back to your tiers ('pro', 'unlimited')
            # This mapping might live in your config or be hardcoded if stable
            # Example mapping (replace with your actual Price IDs):
            price_to_tier_map = {
                os.environ.get('STRIPE_PRO_MONTHLY_PRICE_ID'): 'pro',
                os.environ.get('STRIPE_PRO_YEARLY_PRICE_ID'): 'pro',
                os.environ.get('STRIPE_UNLIMITED_MONTHLY_PRICE_ID'): 'unlimited',
                os.environ.get('STRIPE_UNLIMITED_YEARLY_PRICE_ID'): 'unlimited',
            }
            new_tier = price_to_tier_map.get(price_id)
            
            if not new_tier:
                current_app.logger.error(f"Could not map price ID {price_id} to a tier.")
                return jsonify({"error": "Unknown price ID"}), 400

            # 4. Fetch the user from your database
            user = db.session.get(User, user_id)
            if not user:
                current_app.logger.error(f"User {user_id} not found in database for checkout completion.")
                return jsonify({"error": "User not found"}), 404 # Or 400?

            # 5. Update the user record in your database
            user.stripe_customer_id = stripe_customer_id
            user.stripe_subscription_id = stripe_subscription_id
            user.subscription_tier = new_tier
            user.subscription_status = 'active' # Or use subscription.status
            
            # Reset usage limits upon upgrade? (Optional)
            # user.daily_messages_used = 0
            # user.daily_journals_used = 0
            
            db.session.commit()
            current_app.logger.info(f"User {user_id} updated to tier '{new_tier}' with sub ID {stripe_subscription_id}")
            
        except stripe.error.StripeError as e:
            current_app.logger.error(f"Stripe API error retrieving subscription {stripe_subscription_id}: {e}")
            return jsonify({"error": "Stripe error processing subscription"}), 500
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Error fulfilling checkout session {session['id']} for user {user_id}: {e}")
            # Consider adding alerting here
            return jsonify({"error": "Internal server error during fulfillment"}), 500
        
    # === ADDED: Handle subscription creation event ===
    elif event['type'] == 'customer.subscription.created':
        subscription = event['data']['object']
        stripe_customer_id = subscription.get('customer')
        stripe_subscription_id = subscription.get('id')
        current_app.logger.info(f"Subscription created event received for sub: {stripe_subscription_id}, customer: {stripe_customer_id}")
        
        # Optional: You might add logic here if subscriptions can be 
        # created outside the standard checkout flow, e.g., linking customer/sub ID
        # For now, we primarily rely on checkout.session.completed for initial setup.
        
        # Example: Update status if needed (might be redundant if checkout handler runs)
        # user = db.session.query(User).filter_by(stripe_customer_id=stripe_customer_id).first()
        # if user and user.subscription_status != 'active':
        #     user.subscription_status = 'active' # Or based on subscription status
        #     db.session.commit()
        #     current_app.logger.info(f"Updated user {user.id} status based on subscription creation")

    elif event['type'] == 'customer.subscription.updated':
        subscription = event['data']['object']
        stripe_subscription_id = subscription.get('id')
        stripe_customer_id = subscription.get('customer')
        new_status = subscription.get('status') # e.g., 'active', 'past_due', 'canceled', 'unpaid'
        cancel_at_period_end = subscription.get('cancel_at_period_end', False)

        current_app.logger.info(f"Processing subscription updated event for: {stripe_subscription_id}, Status: {new_status}, CancelAtEnd: {cancel_at_period_end}")

        try:
            # Find user by customer ID or subscription ID (ensure index on these)
            # Prioritize customer_id for lookup if subscription_id might be cleared on cancellation
            user = db.session.query(User).filter(
                (User.stripe_customer_id == stripe_customer_id) & (User.stripe_customer_id != None)
            ).first()

            if not user and stripe_subscription_id:
                # Fallback to subscription ID if customer ID lookup failed or was null
                user = db.session.query(User).filter(
                    User.stripe_subscription_id == stripe_subscription_id
                ).first()

            if not user:
                current_app.logger.warning(f"User not found for subscription update: Sub={stripe_subscription_id}, Cust={stripe_customer_id}")
                # Return 200 so Stripe doesn't retry, as user doesn't exist here
                return jsonify({"status": "User not found, webhook acknowledged"}), 200

            current_app.logger.info(f"Found user {user.id} for subscription update.")

            # --- Determine the new tier based on the current price ID --- 
            new_tier = user.subscription_tier # Default to existing tier
            if subscription.get('items') and subscription['items'].get('data'):
                try:
                    price_id = subscription['items']['data'][0]['price']['id']
                    # Use the same Price ID mapping as in checkout.session.completed
                    price_to_tier_map = {
                        os.environ.get('STRIPE_PRO_MONTHLY_PRICE_ID'): 'pro',
                        os.environ.get('STRIPE_PRO_YEARLY_PRICE_ID'): 'pro',
                        os.environ.get('STRIPE_UNLIMITED_MONTHLY_PRICE_ID'): 'unlimited',
                        os.environ.get('STRIPE_UNLIMITED_YEARLY_PRICE_ID'): 'unlimited',
                        # Add free plan price ID if you have one, otherwise handle cancellation status
                    }
                    mapped_tier = price_to_tier_map.get(price_id)

                    if mapped_tier:
                        new_tier = mapped_tier
                        current_app.logger.info(f"Mapped price {price_id} to tier '{new_tier}' for user {user.id}")
                    else:
                        # This might happen if the subscription is canceled or uses an unknown price
                        current_app.logger.warning(f"Could not map price ID {price_id} to a known tier for user {user.id}. Status is '{new_status}'.")
                        # If status is active but price is unknown, log an error
                        if new_status == 'active':
                             current_app.logger.error(f"ACTIVE subscription {stripe_subscription_id} has UNKNOWN price ID {price_id}!")
                        # If subscription is ending/canceled, we might expect no tier mapping
                        if new_status != 'active' or cancel_at_period_end:
                            new_tier = 'free' # Downgrade if price unknown and not active
                        # Otherwise, keep existing tier? Or set to free? Safer to downgrade.
                        # new_tier = user.subscription_tier # Keep existing 
                except (KeyError, IndexError) as e:
                     current_app.logger.error(f"Could not extract price ID from subscription items for {stripe_subscription_id}: {e}")
                     # Fallback: keep existing tier? Safer to downgrade if status isn't active.
                     if new_status != 'active':
                         new_tier = 'free'

            # --- Update User Record --- 
            user.subscription_status = new_status
            user.subscription_tier = new_tier
            # Ensure subscription ID is up-to-date
            user.stripe_subscription_id = stripe_subscription_id 
            # Ensure customer ID is set (in case lookup was via sub ID)
            user.stripe_customer_id = stripe_customer_id 

            # If the subscription is definitively canceled (not just scheduled for end of period)
            # or becomes inactive for other reasons (incomplete, past_due, unpaid), revert to free tier.
            # Note: 'customer.subscription.deleted' handles final cleanup. This handles intermediate states.
            if new_status != 'active' and new_status != 'trialing':
                user.subscription_tier = 'free'
                # Consider clearing subscription ID here only if status is 'canceled'
                if new_status == 'canceled':
                    user.stripe_subscription_id = None 

            # If cancellation is scheduled, update status but keep tier until deletion event
            if cancel_at_period_end:
                user.subscription_status = 'active_until_period_end' # Use a custom status 
                # Keep the current paid tier until customer.subscription.deleted arrives
                # new_tier would have been determined above already
                user.subscription_tier = new_tier 

            db.session.commit()
            current_app.logger.info(f"User {user.id} subscription updated. New Tier: {user.subscription_tier}, Status: {user.subscription_status}")

        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Error processing subscription update for {stripe_subscription_id}: {e}", exc_info=True)
            # Return 500 so Stripe retries, as this indicates a server-side processing error
            return jsonify({"error": "Internal server error processing subscription update"}), 500

    elif event['type'] == 'customer.subscription.deleted':
        subscription = event['data']['object']
        stripe_subscription_id = subscription.get('id')
        current_app.logger.info(f"Processing subscription deleted event for: {stripe_subscription_id}")
        
        # --- Implement cancellation logic --- 
        try:
            # Find the user associated with this subscription ID
            # Ensure you have an index on stripe_subscription_id for performance
            user = db.session.query(User).filter_by(stripe_subscription_id=stripe_subscription_id).first()
            
            if user:
                current_app.logger.info(f"Found user {user.id} for subscription {stripe_subscription_id}. Updating status to cancelled/free tier.")
                # Update user record
                user.subscription_tier = 'free' # Or None
                user.subscription_status = 'canceled'
                user.stripe_subscription_id = None # Clear the Stripe subscription ID
                user.stripe_customer_id = user.stripe_customer_id # Keep customer ID for potential future subs
                
                db.session.commit()
                current_app.logger.info(f"User {user.id} subscription status updated successfully.")
            else:
                # This might happen if the webhook arrives after the user/subscription was already cleaned up
                current_app.logger.warning(f"Could not find user matching subscription ID {stripe_subscription_id} for deletion event.")
                
        except Exception as e:
            db.session.rollback()
            current_app.logger.error(f"Error processing subscription deletion for {stripe_subscription_id}: {e}", exc_info=True)
            # Return 500 so Stripe retries? Or 400 if it's unlikely to succeed?
            # Let's return 500 for now to indicate a server-side issue.
            return jsonify({"error": "Internal server error processing cancellation"}), 500
            
    # === ADDED: Handle successful payment event ===
    elif event['type'] == 'invoice.paid':
        invoice = event['data']['object']
        stripe_customer_id = invoice.get('customer')
        stripe_subscription_id = invoice.get('subscription') # Can be null for non-subscription invoices
        
        current_app.logger.info(f"Invoice paid event received for customer: {stripe_customer_id}, subscription: {stripe_subscription_id}")
        
        if stripe_customer_id:
            user = db.session.query(User).filter_by(stripe_customer_id=stripe_customer_id).first()
            if user:
                # Ensure user status reflects active payment
                if user.subscription_status != 'active':
                    user.subscription_status = 'active'
                    # Optionally update paid_through_date based on invoice.period_end
                    # user.paid_through_date = datetime.datetime.fromtimestamp(invoice['period_end'])
                    db.session.commit()
                    current_app.logger.info(f"User {user.id} status updated to active due to invoice payment.")
                else:
                    current_app.logger.info(f"Invoice paid for already active user {user.id}.")
            else:
                current_app.logger.warning(f"Invoice paid event received for unknown Stripe customer ID: {stripe_customer_id}")
        else:
             current_app.logger.warning("Invoice paid event received without a customer ID.")

    # === ADDED: Handle failed payment event ===
    elif event['type'] == 'invoice.payment_failed':
        invoice = event['data']['object']
        stripe_customer_id = invoice.get('customer')
        stripe_subscription_id = invoice.get('subscription')
        
        current_app.logger.warning(f"Invoice payment failed event for customer: {stripe_customer_id}, subscription: {stripe_subscription_id}")
        
        if stripe_customer_id:
            user = db.session.query(User).filter_by(stripe_customer_id=stripe_customer_id).first()
            if user:
                # Update status to indicate payment issue
                # Use a specific status like 'past_due' or 'payment_failed'
                if user.subscription_status != 'payment_failed': # Avoid redundant updates
                    user.subscription_status = 'payment_failed' 
                    # Optionally clear paid_through_date or leave as is
                    db.session.commit()
                    current_app.logger.info(f"User {user.id} status updated to payment_failed.")
                    # TODO: Trigger dunning email/notification to user
                else:
                    current_app.logger.info(f"Repeated payment failure for user {user.id}.")

            else:
                current_app.logger.warning(f"Invoice payment failed event for unknown Stripe customer ID: {stripe_customer_id}")
        else:
             current_app.logger.warning("Invoice payment failed event received without a customer ID.")
             
    else:
        # Unexpected event type
        current_app.logger.warning(f"Unhandled Stripe event type: {event['type']}")

    # Return a 200 response to acknowledge receipt of the event
    return jsonify({"status": "success"}), 200
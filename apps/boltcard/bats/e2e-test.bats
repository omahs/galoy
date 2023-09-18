load "../../../test/bats/helpers/setup-and-teardown"
load "../../../test/bats/helpers/ln"

@test "auth: create user" {
  login_user "alice" "+16505554321" "000000"
}

@test "auth: create card" {
  echo "TOKEN_ALICE=$(read_value "alice")"
  export TOKEN_ALICE=$(read_value "alice")

  RESPONSE=$(curl -s "http://localhost:3000/api/createboltcard?token=${TOKEN_ALICE}")
  CALLBACK_URL=$(echo $RESPONSE | jq -r '.url')

  # Making the follow-up curl request
  RESPONSE=$(curl -s "${CALLBACK_URL}")
  echo "$RESPONSE"
  [[ $(echo $RESPONSE | jq -r '.protocol_name') == "create_bolt_card_response" ]] || exit 1

  K1_VALUE=$(echo $RESPONSE | jq -r '.k1')
  K2_VALUE=$(echo $RESPONSE | jq -r '.k2')

  cache_value "k1" "$K1_VALUE"
  cache_value "k2" "$K2_VALUE"
}

@test "auth: create payment and follow up" {
  K1=$(read_value "k1")
  K2=$(read_value "k2")

  RESPONSE=$(bun run bats/script/getpandc.ts $K1 $K2)

  P_VALUE=$(echo $RESPONSE | jq -r '.p')
  C_VALUE=$(echo $RESPONSE | jq -r '.c')

  RESPONSE=$(curl -s "http://localhost:3000/api/ln?p=${P_VALUE}&c=${C_VALUE}")
  echo "$RESPONSE"

  CALLBACK_URL=$(echo $RESPONSE | jq -r '.callback')
  K1_CALLBACK=$(echo $RESPONSE | jq -r '.k1')
  [[ $(echo $K1_CALLBACK) != "null" ]] || exit 1

  echo "K1_CALLBACK: $K1_CALLBACK"
  cache_value "k1_callback" "$K1_CALLBACK"
}

@test "callback" {
  K1_VALUE=$(read_value "k1_callback")
  CALLBACK_URL=http://localhost:3000/api/callback

  echo "K1_VALUE: $K1_VALUE"

  invoice_response="$(lnd_outside_2_cli addinvoice --amt 1000)"
  payment_request=$(echo $invoice_response | jq -r '.payment_request')
  echo $payment_request

  result=$(curl -s "${CALLBACK_URL}?k1=${K1_VALUE}&pr=${payment_request}")
  echo "$result"
  [[ result.status == "OK" ]] || exit 1
}

@test "wipecard" {
  "skip"
  id=""
  curl -s http://localhost:3000/api/wipeboltcard
}
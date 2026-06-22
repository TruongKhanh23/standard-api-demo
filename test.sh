
for i in {1..20}
do
  curl -X POST http://localhost:3000/policies/$1/top-up \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-key" \
  -d '{"amount": 1000}' &
done

wait

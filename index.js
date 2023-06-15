const express = require('express');
const app = express();
require('dotenv').config();
const cors = require('cors');
const jwt = require('jsonwebtoken');
const port = process.env.PORT || 5000;
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

// middle wire
const corsConfig = {
    origin: '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
}
app.use(cors(corsConfig))
app.use(express.json())

const verifyJWT = (req, res, next) => {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return res.status(401).send({ error: true, message: 'unauthorized access token' })
    }

    const token = authorization.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
        if (err) {
            return res.status(401).send({ error: true, message: 'unauthorized access' })
        }
        req.decoded = decoded;
        console.log(decoded);
        next()

    })

}

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.z9fzoxa.mongodb.net/?retryWrites=true&w=majority`;


// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const usersCollection = client.db('smSeason').collection('season');
        const classCollection = client.db('smSeason').collection('class');
        const enrollCollection = client.db('smSeason').collection('enroll');
        const paymentCollection = client.db('smSeason').collection('payment');
        const studentPaySuccessCollection = client.db('smSeason').collection('paySuccess');



        //jwt
        app.post('/jwt', (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN, { expiresIn: '7d' })

            res.send({ token })
        })



        const instructorVerify = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'instructor') {
                return res.status(403).send({ error: true, message: 'forbidden message' });
            }
            next();
        }


        const adminVerify = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email }
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'admin') {
                return res.status(403).send({ error: true, message: 'forbidden message' });
            }
            next();
        }

        app.get('/users', async (req, res) => {
            const result = await usersCollection.find().toArray();
            console.log(result)
            res.send(result)
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            console.log(user);
            const query = { email: user.email }
            const existingUser = await usersCollection.findOne(query)
            if (existingUser) {
                return res.send({ message: 'user already exist', existingUser })
            }
            const result = await usersCollection.insertOne(user);
            res.send(result);
        })


        app.patch('/users/admin/:id', async (req, res) => {
            const id = req.params.id;
            // console.log(id)
            const filter = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: {
                    role: 'admin'
                },
            };
            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result)

        })


        app.patch('/users/instructor/:id', async (req, res) => {
            const id = req.params.id;
            // console.log(id)
            const filter = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: {
                    role: 'instructor'
                },
            };
            const result = await usersCollection.updateOne(filter, updateDoc);
            res.send(result)

        })

        app.get('/users/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const query = { email: email };

            if (req.decoded.email !== email) {
                return res.send({ admin: false })
            }
            const user = await usersCollection.findOne(query);
            const result = { admin: user?.role === 'admin' }
            res.send(result)
        })

        app.get('/users/instructor/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const query = { email: email };

            if (req.decoded.email !== email) {
                return res.send({ admin: false })
            }
            const user = await usersCollection.findOne(query);
            const result = { instructor: user?.role === 'instructor' }
            res.send(result)
        })

        app.get('/instructors', async (req, res) => {
            const query = { role: "instructor" };
            const result = await usersCollection.find(query).toArray();
            res.send(result);
        })

        app.post('/class', async (req, res) => {
            const newClass = req.body;
            console.log(newClass)
            const result = await classCollection.insertOne(newClass);
            res.send(result);
        })


        app.get('/class', async (req, res) => {
            const result = await classCollection.find().toArray();
            res.send(result)
        })


        app.patch('/addClasses/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const status = req.query.status;
            // console.log(id)
            const filter = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: {
                    status: status,
                },
            };
            const result = await classCollection.updateOne(filter, updateDoc);
            res.send(result)

        })

       


        app.get('/enroll', verifyJWT, async (req, res) => {
            const email = req.query.email;
            if (!email) {
                res.send([]);
            }

            const decodedEmail = req.decoded.email;
            if (email !== decodedEmail) {
                return res.status(403).send({ error: true, message: 'forbidden access' })
            }
            const query = { email: email }
            const result = await enrollCollection.find(query).toArray();
            res.send(result)
        })

        app.delete('/enroll/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await enrollCollection.deleteOne(query);
            res.send(result);
        })


        app.get('/enroll/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await enrollCollection.findOne(query);
            res.send(result);
        })


        // create payment intent
        app.post("/create-payment-intent", verifyJWT, async (req, res) => {
            const { classPrice } = req.body;
            const amount = parseInt(classPrice * 100);
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ["card"],
            });

            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

        app.post('/payments', verifyJWT, async (req, res) => {
            const payment = req.body;
            console.log(payment);

            const insertResult = await paymentCollection.insertOne(payment);

            const selectedQuery = { _id: new ObjectId(payment.selectedClassId) };
            const enrolledQuery = { _id: new ObjectId(payment.enrolledClassId) };

            const enrolledClass = await classCollection.findOne(enrolledQuery);
            console.log(enrolledClass);

            // Insert enrolled class to enrolled collection
            const newEnrolledClass = {
                classId: payment.enrolledClassId,
                userEmail: payment.email,
                className: payment.enrolledClassName,
                classImage: payment.enrolledClassImage,
                status: 'paid'
            };

            const insertEnrolled = await studentPaySuccessCollection.insertOne(newEnrolledClass);

            // Update data of class info after enrollment
            const updatedEnrolled = parseInt(enrolledClass.enrolled) + 1;
            const updatedAvailableSeats = parseInt(enrolledClass.availableSeats) - 1;

            const updateDoc = {
                $set: {
                    enrolled: updatedEnrolled,
                    availableSeats: updatedAvailableSeats
                }
            };

            const result = await classCollection.updateOne(enrolledQuery, updateDoc);

            // Delete the class from the selected collection
            const deleteResult = await enrollCollection.deleteOne(selectedQuery);

            res.send(insertResult);
        });


        app.get('/enrolledClass', verifyJWT, async (req, res) => {
            const email = req.query.email;

            if (!email) {
                res.send([]);
            }

            const decodedEmail = req.decoded.email;
            console.log(req.decoded)
            if (email !== decodedEmail) {
                return res.status(403).send({ error: true, message: 'forbidden access' })
            }

            const query = { userEmail: email };
            const result = await studentPaySuccessCollection.find(query).toArray();
            res.send(result);
        });


        app.get('/studentsPaymentsHistory', verifyJWT, async (req, res) => {
            const email = req.query.email;

            if (!email) {
                res.send([]);
            }

            const decodedEmail = req.decoded.email;
            console.log(decodedEmail)
            if (email !== decodedEmail) {
                return res.status(403).send({ error: true, message: 'forbidden access' })
            }

            const query = { email: email };
            const paymentHistory = await paymentCollection.find(query).sort({ date: -1 }).toArray();
            res.send(paymentHistory);
        });


        //All toy get
        app.get('/popularClass', async (req, res) => {
            const toys = await classCollection.find().sort({
                enrolled: -1
            }).toArray();
            res.send(toys);
        })

        // Send a ping to confirm a successful connection
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);





app.get('/', (req, res) => {
    res.send('summer season running')
})

app.listen(port, () => {
    console.log('summer season port is running on port', port);
})
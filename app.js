const express = require('express')
const app = express()
app.use(express.json())
const {open} = require('sqlite')
const sqlite3 = require('sqlite3')
const path = require('path')
const dbPath = path.join(__dirname, 'twitterClone.db')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
let db

const connectingDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    app.listen(3000, () => {
      console.log('Server Running At http://localhost:3000/')
    })
  } catch (e) {
    console.log(`DBError : ${e.message}`)
    process.exit(1)
  }
}

connectingDbAndServer()

const validateTheUser = (request, response, next) => {
  const {username, password} = request.body
  //console.log(username, password)
  if ((username !== undefined) & (password !== undefined)) {
    next()
  }
}

const authenticationOfJwtToken = (request, response, next) => {
  let jwtToken
  const autherHeader = request.headers['authorization']
  if (autherHeader !== undefined) {
    jwtToken = autherHeader.split(' ')[1]
  }
  if (autherHeader === undefined) {
    response.status(401)
    response.send('Invalid JWT Token')
  } else {
    jwt.verify(jwtToken, 'MY_SECRET_TOKEN', async (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        request.username = payload.username
        next()
      }
    })
  }
}

//API 1
app.post('/register/', validateTheUser, async (request, response) => {
  const {username, password, name, gender} = request.body
  const query1 = `SELECT * FROM user WHERE username = '${username}';`
  const res1 = await db.get(query1)
  if (res1 === undefined) {
    if (password.length <= 6) {
      response.status(400)
      response.send('Password is too short')
    } else {
      const hashedPassword = await bcrypt.hash(password, 10)
      const query2 = `INSERT INTO user(name, username, password, gender) VALUES('${name}','${username}','${hashedPassword}','${gender}');`
      await db.run(query2)
      response.status(200)
      response.send('User created successfully')
    }
  } else {
    response.status(400)
    response.send('User already exists')
  }
})

//API 2
app.post('/login/', validateTheUser, async (request, response) => {
  const {username, password} = request.body
  const query1 = `SELECT * FROM user WHERE username = '${username}';`
  const res1 = await db.get(query1)
  if (res1 === undefined) {
    response.status(400)
    response.send('Invalid user')
  } else {
    const comparePassword = await bcrypt.compare(password, res1.password)
    if (comparePassword) {
      const payload = {username: username}
      const jwtToken = jwt.sign(payload, 'MY_SECRET_TOKEN')
      response.send({jwtToken})
    } else {
      response.status(400)
      response.send('Invalid password')
    }
  }
})

//API 3
app.get(
  '/user/tweets/feed/',
  authenticationOfJwtToken,
  async (request, response) => {
    let {username} = request
    const user_id = `SELECT user_id FROM user WHERE username = '${username}';`
    const res1 = await db.get(user_id)
    //console.log(res1.user_id)
    const query = `SELECT u.username AS username, t.tweet AS tweet, t.date_time AS dateTime
    FROM tweet AS t
    JOIN user AS u ON t.user_id = u.user_id
    WHERE t.user_id IN (
        SELECT following_user_id
        FROM follower
        WHERE follower_user_id = ${res1.user_id}
    )
    ORDER BY t.tweet_id DESC
    LIMIT 4 OFFSET 0;`
    const res = await db.all(query)
    response.send(res)
  },
)

//API 4
app.get(
  '/user/following/',
  authenticationOfJwtToken,
  async (request, response) => {
    let {username} = request
    const user_id = `SELECT user_id FROM user WHERE username = '${username}';`
    const res1 = await db.get(user_id)
    const query = `SELECT u.name
    FROM user AS u
    JOIN follower AS f ON u.user_id = f.following_user_id
    WHERE f.follower_user_id = ${res1.user_id};`
    const res = await db.all(query)
    response.send(res)
  },
)

//API 5
app.get(
  '/user/followers/',
  authenticationOfJwtToken,
  async (request, response) => {
    let {username} = request
    const user_id = `SELECT user_id FROM user WHERE username = '${username}';`
    const res1 = await db.get(user_id)
    const query = `SELECT u.name
    FROM user AS u
    JOIN follower AS f ON u.user_id = f.follower_user_id
    WHERE f.following_user_id = ${res1.user_id};`
    const res = await db.all(query)
    response.send(res)
  },
)

//API 6
app.get(
  '/tweets/:tweetId/',
  authenticationOfJwtToken,
  async (request, response) => {
    let {username} = request
    const user_id = `SELECT user_id FROM user WHERE username = '${username}';`
    const res1 = await db.get(user_id)
    let loggedInUserId = res1.user_id
    const {tweetId} = request.params
    const followingQuery = `
      SELECT 1
      FROM tweet AS t
      JOIN follower AS f ON t.user_id = f.following_user_id
      WHERE t.tweet_id = ? AND f.follower_user_id = ?;
    `
    const isFollowing = await db.get(followingQuery, [tweetId, loggedInUserId])

    if (!isFollowing) {
      response.status(401)
      response.send('Invalid Request')
    }

    const tweetQuery = `
      SELECT 
        t.tweet_content AS tweet,
        t.likes_count AS likes,
        t.replies_count AS replies,
        t.tweet_datetime AS dateTime
      FROM 
        tweet AS t
      WHERE 
        t.tweet_id = ?;
    `
    try {
      const tweetDetails = await db.get(tweetQuery, [tweetId])
      if (!tweetDetails) {
        response.status(401)
        response.send('Invalid Request')
      }
      response.send(tweetDetails)
    } catch (error) {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

//API 7
app.get(
  '/tweets/:tweetId/likes/',
  authenticationOfJwtToken,
  async (request, response) => {
    let {username} = request
    const user_id = `SELECT user_id FROM user WHERE username = '${username}';`
    const res1 = await db.get(user_id)
    let loggedInUserId = res1.user_id
    const {tweetId} = request.params
    const followingQuery = `
      SELECT 1
      FROM tweet AS t
      JOIN follower AS f ON t.user_id = f.following_user_id
      WHERE t.tweet_id = ? AND f.follower_user_id = ?;`
    const isFollowing = await db.get(followingQuery, [tweetId, loggedInUserId])

    if (!isFollowing) {
      response.status(401)
      response.send('Invalid Request')
    }

    const tweetQuery = `
      SELECT u.username
      FROM tweet_likes AS tl
      JOIN user AS u ON tl.user_id = u.user_id
      WHERE tl.tweet_id = ?;`
    try {
      const tweetDetails = await db.get(tweetQuery, [tweetId])
      if (!tweetDetails) {
        response.status(401)
        response.send('Invalid Request')
      }
      response.send(tweetDetails)
    } catch (error) {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

//API 8
app.get(
  '/tweets/:tweetId/replies/',
  authenticationOfJwtToken,
  async (request, response) => {
    let {username} = request
    const user_id = `SELECT user_id FROM user WHERE username = '${username}';`
    const res1 = await db.get(user_id)
    let loggedInUserId = res1.user_id
    const {tweetId} = request.params
    const followingQuery = `
      SELECT 1
      FROM tweet AS t
      JOIN follower AS f ON t.user_id = f.following_user_id
      WHERE t.tweet_id = ? AND f.follower_user_id = ?;`
    const isFollowing = await db.get(followingQuery, [tweetId, loggedInUserId])

    if (!isFollowing) {
      response.status(401)
      response.send('Invalid Request')
    }

    const tweetQuery = `
      SELECT 
        u.name AS name,
        tr.reply_content AS reply
      FROM 
        tweet_replies AS tr
      JOIN 
        user AS u ON tr.user_id = u.user_id
      WHERE 
        tr.tweet_id = ?;`
    try {
      const tweetDetails = await db.get(tweetQuery, [tweetId])
      if (!tweetDetails) {
        response.status(401)
        response.send('Invalid Request')
      }
      response.send(tweetDetails)
    } catch (error) {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

//API 9
app.get(
  '/user/tweets/',
  authenticationOfJwtToken,
  async (request, response) => {
    let {username} = request
    const user_id = `SELECT user_id FROM user WHERE username = '${username}';`
    const res1 = await db.get(user_id)
    const query = `SELECT 
    t.tweet_content AS tweet,
    COUNT(l.user_id) AS likes,
    COUNT(r.reply_id) AS replies,
    t.tweet_datetime AS dateTime
    FROM 
        tweet AS t
    LEFT JOIN 
        tweet_likes AS l ON t.tweet_id = l.tweet_id
    LEFT JOIN 
        tweet_replies AS r ON t.tweet_id = r.tweet_id
    WHERE 
        t.user_id = ${res1.user_id}
    GROUP BY 
    t.tweet_id;`
    const res = await db.all(query)
    response.send(res)
  },
)

//API 10
app.post(
  '/user/tweets/',
  authenticationOfJwtToken,
  async (request, response) => {
    let {username} = request
    const user_id = `SELECT user_id FROM user WHERE username = '${username}';`
    const res1 = await db.get(user_id)
    const {tweet} = request.body
    //console.log(tweet)
    const query = `INSERT INTO tweet(tweet,user_id) VALUES('${tweet}',${res1.user_id})`
    const res = await db.run(query)
    response.send('Created a Tweet')
  },
)

//API 11
app.delete(
  '/tweets/:tweetId/',
  authenticationOfJwtToken,
  async (request, response) => {
    let {username} = request
    const user_id = `SELECT user_id FROM user WHERE username = '${username}';`
    const res1 = await db.get(user_id)
    let loggedInUserId = res1.user_id
    //console.log(loggedInUserId)
    const {tweetId} = request.params
    //console.log(tweetId)
    const checkQuery = `
        SELECT user_id FROM tweet WHERE tweet_id = ${tweetId};`
    const res2 = await db.get(checkQuery)
    //console.log(res2)
    if (loggedInUserId === res2.user_id) {
      const deleteQuery = `
            DELETE FROM tweet WHERE tweet_id = ${tweetId};`
      await db.run(deleteQuery)
      response.send('Tweet Removed')
    } else {
      response.status(401)
      response.send('Invalid Request')
    }
  },
)

module.exports = app

﻿// g++ -O3 -static -std=c++11 gobang.cpp -o gobang_ai.exe
#define _CRT_SECURE_NO_WARNINGS
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <string>
#include <iostream>
#include <sstream>
#define BOARD_SIZE 14    // 棋盘大小
#define EMPTY 0          // 空位
#define BLACK 1          // 黑棋
#define WHITE 2          // 白棋
#define INF 2147483647   // 正无穷
#define _INF -2147483647 // 负无穷
struct chessType
{
  int win5;   // 连五
  int alive4; // 活4
  int conti4; // 冲4
  int alive3; // 活3
  int conti3; // 眠3
  int jump3;  // 跳3
  int alive2; // 活2
  int conti2; // 眠2
  int jump2;  // 跳2
  int alive1; // 活1
};
// 坐标结构体
struct coordinate
{
  int x = -1;
  int y = -1;
  int score = 0;
  coordinate(int a = 0, int b = 0, int s = 0) : x(a), y(b), score(s) {}
};
// 棋盘节点结构体
struct Nude
{
  int board[BOARD_SIZE][BOARD_SIZE] = {{0}}; // 棋盘状态
  int state = 0;                             // 棋盘状态标识
  Nude() {}
};
class Game
{
public:
  int myFlag;
  int enemyFlag;
  int inspireSearchLength;
  Nude MAP;
  Game() : myFlag(0), enemyFlag(0) {}
};

// 判断坐标是否在棋盘范围内
bool judgeInRange(coordinate temp)
{
  if (temp.x < 0)
    return false;
  if (temp.y < 0)
    return false;
  if (temp.x >= BOARD_SIZE)
    return false;
  if (temp.y >= BOARD_SIZE)
    return false;
  return true;
}
// 获取指定位置的棋子颜色
int getColor(coordinate target, const Game &game)
{
  if (judgeInRange(target))
    return game.MAP.board[target.x][target.y];
  else
    return game.enemyFlag;
}

// 在指定位置放置棋子
void place(coordinate target, int player, Game &game)
{
  game.MAP.board[target.x][target.y] = player;
}
// 快速排序函数
int partition(coordinate *s, int high, int low)
{
  int pi = s[high].score;
  int i = low;
  for (int j = low; j <= high - 1; j++)
  {
    if (s[j].score >= pi)
    {
      coordinate temp = s[i];
      s[i] = s[j];
      s[j] = temp;
      i++;
    }
  }
  coordinate temp = s[i];
  s[i] = s[high];
  s[high] = temp;
  return i;
}
void quickSort(coordinate *s, int high, int low = 0)
{
  if (high < 0)
    return;
  if (low < high)
  {
    int pi = partition(s, high, low);
    quickSort(s, pi - 1, low);
    quickSort(s, high, pi + 1);
  }
}
// 返回p点dire方向上w距离的点
coordinate Neighbor(coordinate temp, int dire, int w)
{
  const int direction[4][2] = {{1, 0}, {0, 1}, {1, 1}, {1, -1}};
  coordinate neighbor;
  neighbor.x = temp.x + w * direction[dire][0];
  neighbor.y = temp.y + w * direction[dire][1];
  return neighbor;
}
// 判断点在d距离内是否有邻居
int hasNeighbor(coordinate temp, int d, const Game &game)
{
  // 找棋盘上有落子点d个距离内
  for (int i = 0; i < 4; i++)
  {
    for (int j = -d; j <= d; j++)
    {
      if (j != 0)
      {
        coordinate neighbor = Neighbor(temp, i, j);
        if (judgeInRange(neighbor) && getColor(neighbor, game))
          return 1;
      }
    }
  }
  return 0;
}
// 获取drie方向上的情况
int analyzeDire(coordinate temp, int dire, int player, char *beside, const Game &game)
{
  int length = 1;
  int i;
  for (i = -1;; i--)
  {
    coordinate neighbor = Neighbor(temp, dire, i);
    if (judgeInRange(neighbor) && player == game.MAP.board[neighbor.x][neighbor.y])
      length++;
    else
    {
      for (int j = 0; j < 4; j++)
      {
        neighbor = Neighbor(temp, dire, i - j);
        if (judgeInRange(neighbor))
          beside[j] = game.MAP.board[neighbor.x][neighbor.y];
        else
          beside[j] = 3 - player;
      }
      break;
    }
  }
  for (i = 1;; i++)
  {
    coordinate neighbor = Neighbor(temp, dire, i);
    if (judgeInRange(neighbor) && player == game.MAP.board[neighbor.x][neighbor.y])
      length++;
    else
    {
      for (int j = 0; j < 4; j++)
      {
        neighbor = Neighbor(temp, dire, i + j);
        if (judgeInRange(neighbor))
          beside[4 + j] = game.MAP.board[neighbor.x][neighbor.y];
        else
          beside[4 + j] = 3 - player;
      }
      break;
    }
  }
  return length;
}
// 根据连子数目和边缘信息判断棋型
chessType typeAnalysis(coordinate p, int dire, int player, const Game &game)
{
  char b[8] = {0};                                    // beside
  int length = analyzeDire(p, dire, player, b, game); // 获取p点连子的长度和两边延伸4子的信息
  chessType temp = {0};
  if (length >= 5)
    temp.win5++;
  else if (length == 4)
  {
    if (b[0] == 0)
      if (b[4] == 0)
        temp.alive4++; // 011110
      else
        temp.conti4++; // 011112
    else if (b[4] == 0)
      temp.conti4++; // 211110
  }
  else if (length == 3)
  {
    if (b[0] == 0)
    {
      if (b[4] == 0)
      {
        if (b[1] == player)
        {
          if (b[5] == player)
            temp.conti4 += 2; // 1011101
          else if (b[5] == 0)
            temp.conti4++; // 101110x
        }
        else if (b[5] == player)
          temp.conti4++; // x011101
        else if (b[5] == 0 && b[1] == 0)
          temp.alive3++; // 0011100
        else if (b[5] == 0 || b[1] == 0)
          temp.conti3++; // 2011100
      }
      else if (b[1] == player)
        temp.conti4++; // 101112x
      else if (b[1] == 0)
        temp.conti3++; // 001112x
    }
    else if (b[4] == 0)
    {
      if (b[5] == player)
        temp.conti4++; // x211101
      else
        temp.conti3++; // x211100
    }
  }
  else if (length == 2)
  {
    if (b[0] == 0)
    {
      if (b[4] == 0)
      {
        if (b[1] == player)
        {
          if (b[5] == player)
          {
            if (b[2] == player)
            {
              if (b[6] == player)
                temp.conti4 += 2; // 11011011
              else
                temp.conti4++; // 1101101x
            }
            else if (b[2] == 0)
            {
              if (b[6] == player)
                temp.conti4++; // 01011011
              else
                temp.jump3++; // 0101101x
            }
            else
            {
              if (b[6] == player)
                temp.conti4++; // 21011011
              else if (b[6] == 0)
                temp.jump3++; // 21011010
              else
                temp.conti3++; // 21011012
            }
          }
          else
          {
            if (b[2] == player)
              temp.conti4++; // 110110xx
            else if (b[2] == 0)
              temp.jump3++; // 010110xx
            else
              temp.conti3++; // 210110xx
          }
        }
        else if (b[1] == 0)
        {
          if (b[5] == player)
          {
            if (b[6] == player)
              temp.conti4++; // x0011011
            else if (b[6] == 0)
              temp.jump3++; // x0011010
            else
              temp.conti3++; // x0011012
          }
          else
            temp.alive2++; // x00110xx
        }
        else
        {
          if (b[5] == player)
          {
            if (b[6] == player)
              temp.conti4++; // x2011011
            else if (b[6] == 0)
              temp.jump3++; // x2011010
            else
              temp.conti3++; // x2011012
          }
          else if (b[5] == 0)
            temp.alive2++; // x201100x
        }
      }
      else
      {
        if (b[1] == player)
        {
          if (b[2] == player)
            temp.conti4++; // 110112xx
          else if (b[2] == 0)
            temp.conti3++; // 010112xx
        }
        else if (b[1] == 0)
        {
          if (b[2] == player)
            temp.conti3++; // 100112xx
          else if (b[2] == 0)
            temp.conti2++; // 000112xx
        }
      }
    }
    else if (b[4] == 0)
    {
      if (b[5] == player)
      {
        if (b[6] == player)
          temp.conti4++; // xx211011
        else if (b[6] == 0)
          temp.conti3++; // xx211010
      }
      else if (b[5] == 0)
      {
        if (b[6] == player)
          temp.conti3++; // xx211001
        else if (b[6] == 0)
          temp.conti2++; // xx211000
      }
    }
  }
  else
  {
    if (b[0] == 0)
    {
      if (b[4] == 0)
      {
        if (b[1] == player)
        {
          if (b[5] == player)
          {
            if (b[2] == player)
            {
              if (b[6] == player)
              {
                if (b[3] == player)
                {
                  if (b[7] == player)
                    temp.conti4 += 2; // 111010111
                  else
                    temp.conti4++; // 11101011x
                }
                else if (b[3] == 0)
                {
                  if (b[7] == player || b[7] == 0)
                    temp.conti4++; // 011010111/0
                  else
                    temp.jump3++; // 011010112
                }
                else
                {
                  if (b[7] == player)
                    temp.conti4++; // 211010111
                  else if (b[7] == 0)
                    temp.jump3++; // 211010110
                  else
                    temp.conti3++; // 211010112
                }
              }
              else
              {
                if (b[3] == player)
                  temp.conti4++; // 1110101xx
                else if (b[3] == 0)
                  temp.jump3++; // 0110101xx
                else
                  temp.conti3++; // 2110101xx
              }
            }
            else if (b[2] == 0)
            {
              if (b[6] == player)
              {
                if (b[7] == player)
                  temp.conti4++; // x01010111
                else if (b[7] == 0)
                  temp.jump3++; // x01010110
                else
                  temp.conti3++; // x01010112
              }
              else
                temp.jump2++; // x010101xx
            }
            else
            {
              if (b[6] == player)
              {
                if (b[7] == player)
                  temp.conti4++; // x21010111
                else if (b[7] == 0)
                  temp.jump3++; // x21010110
                else
                  temp.conti3++; // x21010112
              }
              else if (b[6] == 0)
                temp.jump2++; // x2101010x
              else
                temp.conti3++; // x2101012x
            }
          }
          else
          {
            if (b[2] == player)
            {
              if (b[3] == player)
                temp.conti4++; // 1110102xx
              else if (b[3] == 0)
                temp.jump3++; // 0110102xx
              else
                temp.conti3++; // 2110102xx
            }
            else if (b[2] == 0)
              temp.jump2++; // x010102xx
            else
              temp.conti2++; // x210102xx
          }
        }
        else
        {
          if (b[5] == player)
            if (b[6] == player)
            {
              if (b[7] == player)
                temp.conti4++; // xxx010111
              else if (b[7] == 0)
                temp.jump3++; // xxx010110
              else
                temp.conti3++; // xxx010112
            }
            else if (b[6] == 0)
              temp.jump2++; // xxx01010x
            else
              temp.conti2++; // xxx01012x
          else
            temp.alive1++; // xxx0102xx
        }
      }
      else
      {
        if (b[1] == player)
        {
          if (b[2] == player)
          {
            if (b[3] == player)
              temp.conti4++; // 111012xxx
            else if (b[3] == 0)
              temp.conti3++; // 011012xxx
          }
          else if (b[2] == 0)
          {
            if (b[3] == player)
              temp.conti3++; // 101012xxx
            else if (b[3] == 0)
              temp.conti2++; // 001012xxx
          }
        }
      }
    }
    else
    {
      if (b[4] == 0)
      {
        if (b[5] == player)
        {
          if (b[6] == player)
          {
            if (b[7] == player)
              temp.conti4++; // xxx210111
            else if (b[7] == 0)
              temp.conti3++; // xxx210110
          }
          else if (b[6] == 0)
          {
            if (b[7] == player)
              temp.conti3++; // xxx210101
            else if (b[7] == 0)
              temp.conti2++; // xxx210100
          }
        }
        else if (b[5] == 0)
        {
          if (b[6] == player)
          {
            if (b[7] == player)
              temp.conti3++; // xxx210011
            else if (b[7] == 0)
              temp.conti2++; // xxx210010
          }
          else if (b[6] == 0)
          {
            if (b[7] == player)
              temp.conti2++; // xxx210001
          }
        }
      }
    }
  }
  return temp;
}
// 单点得分
__attribute__((always_inline))
inline int singleScore(coordinate p, int player, const Game &game)
{
  chessType chesstype = typeAnalysis(p, 0, player, game);
  int score = 0;
  for (int i = 1; i < 4; i++)
  {
    chessType temp = typeAnalysis(p, i, player, game);
    chesstype.win5 += temp.win5;
    chesstype.alive4 += temp.alive4;
    chesstype.conti4 += temp.conti4;
    chesstype.alive3 += temp.alive3;
    chesstype.conti3 += temp.conti3;
    chesstype.jump3 += temp.jump3;
    chesstype.alive2 += temp.alive2;
    chesstype.conti2 += temp.conti2;
    chesstype.jump2 += temp.jump2;
    chesstype.alive1 += temp.alive1;
  }
  score += chesstype.win5 << 20;
  score += ((chesstype.conti4 << 9) + (chesstype.alive3 << 8) + (chesstype.conti3 << 7) + (chesstype.alive4 << 10) +
            (chesstype.jump3 << 6) + (chesstype.alive2 << 5) + (chesstype.jump2 << 3) + chesstype.conti2 + chesstype.alive1);
  if (chesstype.alive3 > 1 || (chesstype.conti4 && chesstype.alive3) || chesstype.alive4 || chesstype.conti4 > 1 ||
  (chesstype.jump3 && chesstype.alive3) || chesstype.jump3 > 1 || (chesstype.conti4 && chesstype.jump3)) // 必胜?
    score += (1 << 12);
  return score;
}
// 棋盘整体局面分
int wholeScore(int player, const Game &game)
{
    int Score = 0;
    coordinate temps[BOARD_SIZE * BOARD_SIZE];
    int length = 0;
    for (int i = 0; i < BOARD_SIZE; i++)
    {
        for (int j = 0; j < BOARD_SIZE; j++)
        {
            coordinate temp = {i, j, game.MAP.board[i][j]};
            if (temp.score == 0)
                continue;
            temps[length] = temp;
            length++;
        }
    }
    for (int i = 0; i < length; i++)
    {
        if (temps[i].score == player)
            Score += singleScore(temps[i], player, game);
        else
            Score -= singleScore(temps[i], 3 - player, game);
    }
    return Score;
}
// 启发性搜索
int inspireSearch(coordinate *scoreBoard, int player, Game &game)
{
  int length = 0;
  for (int i = 0; i < BOARD_SIZE; i++)
  {
    for (int j = 0; j < BOARD_SIZE; j++)
    {
      if (game.MAP.board[i][j] == 0)
      {
        coordinate temp = {i, j, 0};
        if (hasNeighbor(temp, 2, game))
        {
          scoreBoard[length] = temp;
          scoreBoard[length].score = singleScore(temp, 3 - player, game) + singleScore(temp, player, game);
          length++;
        }
      }
    }
  }
  // 对 scoreBoard 进行排序
  quickSort(scoreBoard, length - 1);
  // 找到最高分数
  int maxScore = scoreBoard[0].score;
  const int threshold = maxScore / 3;
  // 找到分界线
  int boundary = 1;
  for (int i = 1; i < length; i++)
  {
    if (scoreBoard[i].score <= threshold)
    {
      boundary = i; // 更新分界线位置
      break;        // 分数低于阈值，跳出循环
    }
  }
  // 返回分界线位置
  return boundary > game.inspireSearchLength ? game.inspireSearchLength : boundary;
}

// 负极大极小值搜索
coordinate alphaBeta(int depth, int alpha, int beta, int player, coordinate command, Game &game)
{
  coordinate temp = command;
  if (depth == 0)
  {
    temp.score = wholeScore(player, game);
    return temp;
  }
  coordinate steps[BOARD_SIZE * BOARD_SIZE];
  int length = inspireSearch(steps, player, game); // 搜索可落子点
  if (length > 2)
    depth--;
  for (int i = 0; i < length; i++)
  {
    place(steps[i], player, game);                                               // 模拟落子
    temp = alphaBeta(depth, -beta, -alpha, 3 - player, steps[i], game); // 取负值并交换alpha和beta
    temp.score *= -1;
    place(steps[i], 0, game); // 还原落子
    if (temp.score >= beta)
    {
      temp.score = beta;
      return temp; // 剪枝
    }
    if (temp.score > alpha)
      alpha = temp.score;
  }
  temp.score = alpha;
  return temp;
}
// 搜索入口
coordinate entrance(int depth, int alpha, int beta, int player, Game &game)
{
  coordinate steps[BOARD_SIZE * BOARD_SIZE]{};
  coordinate temp;
  coordinate best;
  int length = inspireSearch(steps, player, game); // 搜索可落子点
  for (int i = 0; i < length; i++)
  {
    place(steps[i], player, game);                                               // 模拟落子
    temp = alphaBeta(depth, -beta, -alpha, 3 - player, steps[i], game); // 递归
    temp.score *= -1;
    place(steps[i], 0, game); // 还原落子
    if (temp.score > alpha)
    {
      alpha = temp.score;
      best = steps[i]; // 记录最佳落子
    }
  }
  best.score = alpha;
  return best;
}

coordinate calculateNextMove(const std::string &boardStr, int playerFlag, int difficulty, int inspireSearchLength)
{
  Game game;
  game.myFlag = playerFlag;
  game.enemyFlag = 3 - playerFlag;
  game.inspireSearchLength = inspireSearchLength;
  // 解析棋盘字符串
  std::istringstream iss(boardStr);
  for (int i = 0; i < BOARD_SIZE; ++i)
    for (int j = 0; j < BOARD_SIZE; ++j)
      iss >> game.MAP.board[i][j];

  int depth = difficulty + 1;
  coordinate best = entrance(depth, _INF, INF, game.myFlag, game);
  return best;
}

int main(int argc, char *argv[])
{
  coordinate result = calculateNextMove(argv[1], atoi(argv[2]), atoi(argv[3]), atoi(argv[4]));
  std::cout << result.x << " " << result.y << " " << result.score;
  return 0;
}
